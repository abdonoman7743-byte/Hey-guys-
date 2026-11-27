import { API_BASE_URL } from '../lib/apiBase';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { CallType, IceServerConfig, PublicProfile } from '../types/domain';
import {
  callReducer,
  INITIAL_CALL_STATE,
  type CallEndReason,
  type CallPeerInfo,
} from '../utils/callStateMachine';
import {
  createCallRecord,
  createMissedCallNotification,
  syncPresenceToFirestore,
  updateCallRecord,
} from '../services/firestoreService';
import { ringtone } from '../utils/ringtone';

interface UseWebRTCOptions {
  socket: Socket | null;
  currentUser: PublicProfile | null;
  getIdToken: () => Promise<string | null>;
  profilesByUid: Record<string, PublicProfile>;
}

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export function useWebRTC({
  socket,
  currentUser,
  getIdToken,
  profilesByUid,
}: UseWebRTCOptions) {
  const [callState, dispatch] = useReducer(callReducer, INITIAL_CALL_STATE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [iceConnectionState, setIceConnectionState] = useState<string>('new');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceOption[]>([]);
  const [selectedAudioOutputId, setSelectedAudioOutputId] = useState<string>('default');
  const [remoteAudioLevel, setRemoteAudioLevel] = useState<number>(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const callStateRef = useRef(callState);
  callStateRef.current = callState;
  const ringTimeoutRef = useRef<number | null>(null);
  const endedClearRef = useRef<number | null>(null);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${idx + 1}`,
          kind: d.kind,
        }));
      setAudioOutputs(outputs);
    } catch {
      // Ignore enumerateDevices errors when permissions not yet granted
    }
  }, []);

  const stopMediaAndPc = useCallback(() => {
    if (ringTimeoutRef.current !== null) {
      window.clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    ringtone.stop();

    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // Ignore close error
      }
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    pendingIceRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setIceConnectionState('new');
    setRemoteAudioLevel(0);
  }, []);

  const fetchIceServers = useCallback(async (): Promise<IceServerConfig[]> => {
    try {
      const token = await getIdToken();
      if (!token) return [{ urls: 'stun:stun.l.google.com:19302' }];
      const res = await fetch(`${API_BASE_URL}/api/rtc-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [{ urls: 'stun:stun.l.google.com:19302' }];
      const json = (await res.json()) as { iceServers?: IceServerConfig[] };
      return json.iceServers && json.iceServers.length > 0
        ? json.iceServers
        : [{ urls: 'stun:stun.l.google.com:19302' }];
    } catch {
      return [{ urls: 'stun:stun.l.google.com:19302' }];
    }
  }, [getIdToken]);

  const acquireMedia = useCallback(
    async (callType: CallType, facingMode: 'user' | 'environment' = 'user') => {
      setMediaError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = 'Media devices API unavailable in this browser context.';
        setMediaError(msg);
        throw new Error(msg);
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video:
            callType === 'video'
              ? {
                  facingMode,
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        void refreshDevices();
        return stream;
      } catch (err: any) {
        // Fallback: if video camera fails, try audio-only when possible
        if (callType === 'video') {
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = audioOnly;
            setLocalStream(audioOnly);
            setMediaError('Camera unavailable — continuing with microphone audio only.');
            return audioOnly;
          } catch {
            // Fall through to error
          }
        }
        const msg = err?.message || 'Unable to access microphone or camera.';
        setMediaError(msg);
        throw new Error(msg);
      }
    },
    [refreshDevices]
  );

  const createPeerConnection = useCallback(
    async (callId: string, peerUid: string, stream: MediaStream) => {
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => {
          remote.addTrack(t);
        });
        if (!event.streams[0] && event.track) {
          remote.addTrack(event.track);
        }
        setRemoteStream(new MediaStream(remote.getTracks()));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('call:ice-candidate', {
            callId,
            toUid: peerUid,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        setIceConnectionState(state);
        if (state === 'connected' || state === 'completed') {
          ringtone.stop();
          dispatch({ type: 'MARK_ACTIVE', nowMs: Date.now() });
          const user = currentUserRef.current;
          if (user && callStateRef.current.isCaller) {
            void updateCallRecord(callId, 'active', 0, false).catch(() => {});
          }
        } else if (state === 'disconnected') {
          // Attempt ICE restart on transient network switch
          try {
            pc.restartIce();
          } catch {
            // Ignore
          }
        } else if (state === 'failed') {
          if (socket) {
            socket.emit('call:hangup', { callId, toUid: peerUid, reason: 'failed' });
          }
          stopMediaAndPc();
          dispatch({ type: 'END_CALL', reason: 'failed' });
        }
      };

      return pc;
    },
    [fetchIceServers, socket, stopMediaAndPc]
  );

  const finishAndClear = useCallback(
    (reason: CallEndReason, durationSec: number) => {
      const st = callStateRef.current;
      const user = currentUserRef.current;
      stopMediaAndPc();
      dispatch({ type: 'END_CALL', reason });

      if (user) {
        void syncPresenceToFirestore(
          user.uid,
          user.manualStatus === 'busy' ? 'busy' : 'online'
        );
      }

      if (st.callId && st.isCaller) {
        const recordStatus =
          reason === 'hangup'
            ? st.connectedAtMs
              ? 'ended'
              : 'missed'
            : reason === 'offline'
              ? 'missed'
              : reason;
        void updateCallRecord(st.callId, recordStatus, durationSec, true).catch(() => {});
      }

      if (endedClearRef.current !== null) {
        window.clearTimeout(endedClearRef.current);
      }
      endedClearRef.current = window.setTimeout(() => {
        dispatch({ type: 'RESET' });
        setElapsedSeconds(0);
      }, 2500);
    },
    [stopMediaAndPc]
  );

  const startCall = useCallback(
    async (peer: PublicProfile, callType: CallType) => {
      if (!socket || !currentUser) return;
      if (callStateRef.current.phase !== 'idle') return;

      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const peerInfo: CallPeerInfo = {
        uid: peer.uid,
        displayName: peer.displayName,
        username: peer.username,
        avatarUrl: peer.avatarUrl,
      };

      dispatch({
        type: 'START_OUTGOING',
        callId,
        callType,
        peer: peerInfo,
        nowMs: Date.now(),
      });

      try {
        const stream = await acquireMedia(callType, 'user');
        await createPeerConnection(callId, peer.uid, stream);
        ringtone.startOutgoing();

        void syncPresenceToFirestore(currentUser.uid, 'busy');
        void createCallRecord({
          callId,
          caller: currentUser,
          callee: peer,
          type: callType,
        }).catch(() => {});

        socket.emit('call:initiate', {
          callId,
          toUid: peer.uid,
          callType,
          callerName: currentUser.displayName,
          callerUsername: currentUser.username,
          callerAvatarUrl: currentUser.avatarUrl,
        });

        // 45s unanswered call timeout
        ringTimeoutRef.current = window.setTimeout(() => {
          if (callStateRef.current.phase === 'outgoing' && callStateRef.current.callId === callId) {
            socket.emit('call:hangup', { callId, toUid: peer.uid, reason: 'missed' });
            void createMissedCallNotification({
              recipientUid: peer.uid,
              caller: currentUser,
              callId,
              callType,
            }).catch(() => {});
            finishAndClear('missed', 0);
          }
        }, 45000);
      } catch {
        stopMediaAndPc();
        dispatch({ type: 'END_CALL', reason: 'failed' });
        window.setTimeout(() => dispatch({ type: 'RESET' }), 2500);
      }
    },
    [acquireMedia, createPeerConnection, currentUser, finishAndClear, socket, stopMediaAndPc]
  );

  const acceptIncomingCall = useCallback(async () => {
    const st = callStateRef.current;
    if (!socket || !currentUser || st.phase !== 'incoming' || !st.callId || !st.peer) return;

    ringtone.stop();
    dispatch({ type: 'ACCEPT_OR_CONNECT', nowMs: Date.now() });

    try {
      const stream = await acquireMedia(st.callType, 'user');
      await createPeerConnection(st.callId, st.peer.uid, stream);
      void syncPresenceToFirestore(currentUser.uid, 'busy');
      socket.emit('call:accept', { callId: st.callId, toUid: st.peer.uid });
    } catch {
      socket.emit('call:reject', { callId: st.callId, toUid: st.peer.uid, reason: 'failed' });
      stopMediaAndPc();
      dispatch({ type: 'END_CALL', reason: 'failed' });
      window.setTimeout(() => dispatch({ type: 'RESET' }), 2500);
    }
  }, [acquireMedia, createPeerConnection, currentUser, socket, stopMediaAndPc]);

  const rejectIncomingCall = useCallback(() => {
    const st = callStateRef.current;
    if (!socket || st.phase !== 'incoming' || !st.callId || !st.peer) return;
    socket.emit('call:reject', { callId: st.callId, toUid: st.peer.uid, reason: 'rejected' });
    stopMediaAndPc();
    dispatch({ type: 'RESET' });
  }, [socket, stopMediaAndPc]);

  const hangupCall = useCallback(() => {
    const st = callStateRef.current;
    if (!st.callId || !st.peer) return;

    const durationSec = st.connectedAtMs
      ? Math.max(0, Math.floor((Date.now() - st.connectedAtMs) / 1000))
      : 0;

    const reason: CallEndReason = st.phase === 'outgoing' ? 'missed' : 'hangup';
    if (socket) {
      socket.emit('call:hangup', { callId: st.callId, toUid: st.peer.uid, reason });
    }
    if (reason === 'missed' && currentUser) {
      void createMissedCallNotification({
        recipientUid: st.peer.uid,
        caller: currentUser,
        callId: st.callId,
        callType: st.callType,
      }).catch(() => {});
    }
    finishAndClear(reason, durationSec);
  }, [currentUser, finishAndClear, socket]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    const nextMuted = !callStateRef.current.isMuted;
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }
    dispatch({ type: 'TOGGLE_MUTE' });
    if (socket && callStateRef.current.callId && callStateRef.current.peer) {
      socket.emit('call:media-state', {
        callId: callStateRef.current.callId,
        toUid: callStateRef.current.peer.uid,
        isMuted: nextMuted,
      });
    }
  }, [socket]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    const nextOff = !callStateRef.current.isCameraOff;
    if (stream) {
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !nextOff;
      });
    }
    dispatch({ type: 'TOGGLE_CAMERA' });
    if (socket && callStateRef.current.callId && callStateRef.current.peer) {
      socket.emit('call:media-state', {
        callId: callStateRef.current.callId,
        toUid: callStateRef.current.peer.uid,
        isCameraOff: nextOff,
      });
    }
  }, [socket]);

  const toggleSpeaker = useCallback(() => {
    dispatch({ type: 'TOGGLE_SPEAKER' });
  }, []);

  const switchCamera = useCallback(async () => {
    const st = callStateRef.current;
    if (st.callType !== 'video' || !localStreamRef.current) return;
    const nextFacing = st.facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      const oldTracks = localStreamRef.current.getVideoTracks();
      oldTracks.forEach((t) => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });
      localStreamRef.current.addTrack(newTrack);
      newTrack.enabled = !st.isCameraOff;

      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newTrack);
        }
      }
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      dispatch({ type: 'SWITCH_CAMERA' });
    } catch (err: any) {
      setMediaError(err?.message || 'Unable to switch camera.');
    }
  }, []);

  // Call duration timer
  useEffect(() => {
    if (callState.phase !== 'active' || !callState.connectedAtMs) {
      return;
    }
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - callState.connectedAtMs!) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [callState.phase, callState.connectedAtMs]);

  // Remote audio level analyzer for voice/video speaking feedback
  useEffect(() => {
    if (!remoteStream || remoteStream.getAudioTracks().length === 0) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    let rafId = 0;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(remoteStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const sample = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        setRemoteAudioLevel(avg);
        rafId = window.requestAnimationFrame(sample);
      };
      rafId = window.requestAnimationFrame(sample);
    } catch {
      // Ignore analyzer setup errors
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (ctx) void ctx.close().catch(() => {});
    };
  }, [remoteStream]);

  // Socket.IO signaling listeners
  useEffect(() => {
    if (!socket) return;

    const onIncoming = (payload: {
      callId: string;
      fromUid: string;
      callType: CallType;
      callerName: string;
      callerUsername: string;
      callerAvatarUrl?: string;
    }) => {
      if (callStateRef.current.phase !== 'idle') {
        socket.emit('call:reject', {
          callId: payload.callId,
          toUid: payload.fromUid,
          reason: 'busy',
        });
        return;
      }

      const knownProfile = profilesByUid[payload.fromUid];
      dispatch({
        type: 'RECEIVE_INCOMING',
        callId: payload.callId,
        callType: payload.callType,
        peer: {
          uid: payload.fromUid,
          displayName: knownProfile?.displayName || payload.callerName,
          username: knownProfile?.username || payload.callerUsername,
          avatarUrl: knownProfile?.avatarUrl || payload.callerAvatarUrl,
        },
        nowMs: Date.now(),
      });
      ringtone.startIncoming();

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(
            payload.callType === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call',
            { body: `${payload.callerName} (@${payload.callerUsername})` }
          );
        } catch {
          // Ignore browser notification failure
        }
      }
    };

    const onRinging = () => {
      dispatch({ type: 'PEER_RINGING' });
    };

    const onAccepted = async (payload: { callId: string; fromUid: string }) => {
      const st = callStateRef.current;
      if (st.callId !== payload.callId || !pcRef.current) return;
      if (ringTimeoutRef.current !== null) {
        window.clearTimeout(ringTimeoutRef.current);
        ringTimeoutRef.current = null;
      }
      ringtone.stop();
      dispatch({ type: 'ACCEPT_OR_CONNECT', nowMs: Date.now() });

      try {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socket.emit('call:offer', {
          callId: st.callId,
          toUid: payload.fromUid,
          sdp: offer,
        });
      } catch {
        finishAndClear('failed', 0);
      }
    };

    const onOffer = async (payload: {
      callId: string;
      fromUid: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const st = callStateRef.current;
      if (st.callId !== payload.callId || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const cand of pendingIceRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
        }
        pendingIceRef.current = [];
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit('call:answer', {
          callId: st.callId,
          toUid: payload.fromUid,
          sdp: answer,
        });
      } catch {
        finishAndClear('failed', 0);
      }
    };

    const onAnswer = async (payload: {
      callId: string;
      fromUid: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const st = callStateRef.current;
      if (st.callId !== payload.callId || !pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const cand of pendingIceRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
        }
        pendingIceRef.current = [];
      } catch {
        finishAndClear('failed', 0);
      }
    };

    const onIceCandidate = async (payload: {
      callId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      if (callStateRef.current.callId !== payload.callId || !pcRef.current) return;
      if (pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {
          // Ignore malformed candidate
        }
      } else {
        pendingIceRef.current.push(payload.candidate);
      }
    };

    const onRejected = (payload: { callId: string; reason?: string }) => {
      if (callStateRef.current.callId !== payload.callId) return;
      const reason = payload.reason === 'busy' ? 'busy' : 'rejected';
      finishAndClear(reason, 0);
    };

    const onBusy = (payload: { callId: string }) => {
      if (callStateRef.current.callId !== payload.callId) return;
      finishAndClear('busy', 0);
    };

    const onPeerOffline = (payload: { callId: string; toUid: string }) => {
      const st = callStateRef.current;
      if (st.callId !== payload.callId) return;
      const user = currentUserRef.current;
      if (user) {
        void createMissedCallNotification({
          recipientUid: payload.toUid,
          caller: user,
          callId: payload.callId,
          callType: st.callType,
        }).catch(() => {});
      }
      finishAndClear('offline', 0);
    };

    const onMediaState = (payload: {
      callId: string;
      isMuted?: boolean;
      isCameraOff?: boolean;
    }) => {
      if (callStateRef.current.callId !== payload.callId) return;
      dispatch({
        type: 'SET_PEER_MEDIA',
        peerMuted: payload.isMuted,
        peerCameraOff: payload.isCameraOff,
      });
    };

    const onEnded = (payload: { callId: string; reason?: string }) => {
      const st = callStateRef.current;
      if (st.callId !== payload.callId) return;
      const durationSec = st.connectedAtMs
        ? Math.max(0, Math.floor((Date.now() - st.connectedAtMs) / 1000))
        : 0;
      const reason: CallEndReason =
        payload.reason === 'missed'
          ? 'missed'
          : payload.reason === 'failed'
            ? 'failed'
            : 'hangup';
      finishAndClear(reason, durationSec);
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:ringing', onRinging);
    socket.on('call:accepted', onAccepted);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:rejected', onRejected);
    socket.on('call:busy', onBusy);
    socket.on('call:peer-offline', onPeerOffline);
    socket.on('call:media-state', onMediaState);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:ringing', onRinging);
      socket.off('call:accepted', onAccepted);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:rejected', onRejected);
      socket.off('call:busy', onBusy);
      socket.off('call:peer-offline', onPeerOffline);
      socket.off('call:media-state', onMediaState);
      socket.off('call:ended', onEnded);
    };
  }, [finishAndClear, profilesByUid, socket]);

  return {
    callState,
    localStream,
    remoteStream,
    iceConnectionState,
    mediaError,
    elapsedSeconds,
    audioOutputs,
    selectedAudioOutputId,
    setSelectedAudioOutputId,
    remoteAudioLevel,
    startCall,
    acceptIncomingCall,
    rejectIncomingCall,
    hangupCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    switchCamera,
  };
}
