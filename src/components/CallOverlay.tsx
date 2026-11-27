import { useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type { SupportedLanguage } from '../types/domain';
import type { CallSessionState } from '../utils/callStateMachine';
import type { MediaDeviceOption } from '../hooks/useWebRTC';
import { formatCallDuration } from '../utils/chatUtils';
import { Avatar } from './Avatar';

interface CallOverlayProps {
  lang: SupportedLanguage;
  callState: CallSessionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  iceConnectionState: string;
  mediaError: string | null;
  elapsedSeconds: number;
  audioOutputs: MediaDeviceOption[];
  selectedAudioOutputId: string;
  remoteAudioLevel: number;
  onSelectAudioOutput: (deviceId: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onSwitchCamera: () => void;
}

export function CallOverlay({
  lang,
  callState,
  localStream,
  remoteStream,
  iceConnectionState,
  mediaError,
  elapsedSeconds,
  audioOutputs,
  selectedAudioOutputId,
  remoteAudioLevel,
  onSelectAudioOutput,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
  onToggleCamera,
  onToggleSpeaker,
  onSwitchCamera,
}: CallOverlayProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    const audioEl = remoteAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    const videoEl = remoteVideoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (audioEl && typeof audioEl.setSinkId === 'function' && selectedAudioOutputId) {
      void audioEl.setSinkId(selectedAudioOutputId).catch(() => {});
    }
    if (videoEl && typeof videoEl.setSinkId === 'function' && selectedAudioOutputId) {
      void videoEl.setSinkId(selectedAudioOutputId).catch(() => {});
    }
  }, [selectedAudioOutputId]);

  if (callState.phase === 'idle' || !callState.peer) {
    return null;
  }

  // Incoming Call Modal
  if (callState.phase === 'incoming') {
    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-label={
          callState.callType === 'video' ? t(lang, 'incomingCallVideo') : t(lang, 'incomingCallVoice')
        }
        className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-white space-y-6 shadow-2xl">
          <p className="text-xs font-medium tracking-wide text-teal-400">
            {callState.callType === 'video'
              ? t(lang, 'incomingCallVideo')
              : t(lang, 'incomingCallVoice')}
          </p>

          <div className="flex flex-col items-center gap-3">
            <Avatar name={callState.peer.displayName} src={callState.peer.avatarUrl} size="xl" />
            <div>
              <h3 className="text-xl font-bold">{callState.peer.displayName}</h3>
              <p className="text-sm text-slate-400" dir="ltr">
                @{callState.peer.username}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2">
            <button
              type="button"
              onClick={onReject}
              aria-label={t(lang, 'declineCall')}
              className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={onAccept}
              aria-label={t(lang, 'answerCall')}
              className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              {callState.callType === 'video' ? (
                <Video className="w-6 h-6" />
              ) : (
                <Phone className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const endStatusMessage = () => {
    switch (callState.endReason) {
      case 'busy':
        return t(lang, 'callEndedBusy');
      case 'rejected':
        return t(lang, 'callEndedRejected');
      case 'missed':
        return t(lang, 'callEndedMissed');
      case 'offline':
        return t(lang, 'callEndedOffline');
      case 'failed':
        return t(lang, 'callEndedFailed');
      default:
        return t(lang, 'callEndedNotice');
    }
  };

  const statusLine =
    callState.phase === 'ended'
      ? endStatusMessage()
      : callState.phase === 'active'
        ? formatCallDuration(elapsedSeconds)
        : callState.phase === 'connecting'
          ? t(lang, 'connectingCall')
          : callState.peerRinging
            ? t(lang, 'outgoingRinging')
            : t(lang, 'outgoingCalling');

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      role="dialog"
      aria-modal="true"
      aria-label={callState.peer.displayName}
      className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between"
    >
      {/* Hidden audio element ensures voice playback even when video is off */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        muted={!callState.isSpeakerOn}
      />

      {/* Remote Video Stage or Voice Call Centerpiece */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-900">
        {callState.callType === 'video' &&
        remoteStream &&
        remoteStream.getVideoTracks().length > 0 &&
        !callState.peerCameraOff ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={!callState.isSpeakerOn}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div
              className="rounded-full p-2 transition-transform duration-150"
              style={{
                transform: `scale(${1 + Math.min(0.18, remoteAudioLevel * 0.4)})`,
                boxShadow:
                  remoteAudioLevel > 0.05
                    ? '0 0 0 8px rgba(15, 118, 110, 0.28)'
                    : 'none',
              }}
            >
              <Avatar name={callState.peer.displayName} src={callState.peer.avatarUrl} size="xl" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{callState.peer.displayName}</h2>
              <p className="text-sm text-slate-400" dir="ltr">
                @{callState.peer.username}
              </p>
            </div>
            <p className="text-base font-medium text-teal-300 tabular-nums">{statusLine}</p>
            {callState.peerMuted && (
              <p className="text-xs text-amber-300 inline-flex items-center gap-1.5">
                <MicOff className="w-3.5 h-3.5" />
                <span>{t(lang, 'peerMutedLabel')}</span>
              </p>
            )}
          </div>
        )}

        {/* Top Bar Scrim Overlay */}
        <div className="absolute top-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-b from-black/75 to-transparent flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-semibold truncate">{callState.peer.displayName}</p>
            <div className="flex items-center gap-2 text-xs text-slate-300 tabular-nums">
              <span>{statusLine}</span>
              <span aria-hidden="true">·</span>
              <span>
                {t(lang, 'iceStateLabel')}: {iceConnectionState}
              </span>
            </div>
          </div>

          {audioOutputs.length > 1 && (
            <div className="flex items-center gap-2">
              <label htmlFor="audio-output-select" className="sr-only">
                {t(lang, 'audioOutputLabel')}
              </label>
              <select
                id="audio-output-select"
                value={selectedAudioOutputId}
                onChange={(e) => onSelectAudioOutput(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {audioOutputs.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Media Error Notice */}
        {mediaError && (
          <div
            role="alert"
            className="absolute top-20 inset-x-4 max-w-md mx-auto px-4 py-2.5 rounded-xl bg-rose-950/90 border border-rose-700 text-xs text-rose-100 text-center"
          >
            {mediaError}
          </div>
        )}

        {/* Local Self-View PiP */}
        {callState.callType === 'video' && localStream && !callState.isCameraOff && (
          <div className="absolute bottom-4 end-4 w-28 sm:w-40 aspect-[3/4] sm:aspect-video rounded-2xl overflow-hidden border border-white/20 bg-slate-900 shadow-xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                callState.facingMode === 'user' ? '-scale-x-100' : ''
              }`}
            />
          </div>
        )}
      </div>

      {/* Bottom Controls Dock */}
      <footer className="px-4 py-5 bg-slate-950 border-t border-slate-800/80 flex items-center justify-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={callState.isMuted ? t(lang, 'unmuteMic') : t(lang, 'muteMic')}
          className={`min-h-[48px] min-w-[48px] px-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
            callState.isMuted
              ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
        >
          {callState.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          <span className="hidden sm:inline">
            {callState.isMuted ? t(lang, 'unmuteMic') : t(lang, 'muteMic')}
          </span>
        </button>

        {callState.callType === 'video' && (
          <>
            <button
              type="button"
              onClick={onToggleCamera}
              aria-label={
                callState.isCameraOff ? t(lang, 'turnCameraOn') : t(lang, 'turnCameraOff')
              }
              className={`min-h-[48px] min-w-[48px] px-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
                callState.isCameraOff
                  ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              {callState.isCameraOff ? (
                <VideoOff className="w-5 h-5" />
              ) : (
                <Video className="w-5 h-5" />
              )}
              <span className="hidden sm:inline">
                {callState.isCameraOff ? t(lang, 'turnCameraOn') : t(lang, 'turnCameraOff')}
              </span>
            </button>

            <button
              type="button"
              onClick={onSwitchCamera}
              aria-label={t(lang, 'switchCamera')}
              className="min-h-[48px] min-w-[48px] px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer"
            >
              <RefreshCw className="w-5 h-5" />
              <span className="hidden sm:inline">{t(lang, 'switchCamera')}</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleSpeaker}
          aria-label={callState.isSpeakerOn ? t(lang, 'speakerOff') : t(lang, 'speakerOn')}
          className={`min-h-[48px] min-w-[48px] px-4 rounded-2xl flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
            !callState.isSpeakerOn
              ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40'
              : 'bg-slate-800 hover:bg-slate-700 text-white'
          }`}
        >
          {callState.isSpeakerOn ? (
            <Volume2 className="w-5 h-5" />
          ) : (
            <VolumeX className="w-5 h-5" />
          )}
          <span className="hidden sm:inline">
            {callState.isSpeakerOn ? t(lang, 'speakerOn') : t(lang, 'speakerOff')}
          </span>
        </button>

        <button
          type="button"
          onClick={onHangup}
          aria-label={t(lang, 'endCall')}
          className="min-h-[48px] px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 text-xs font-semibold transition-colors cursor-pointer"
        >
          <PhoneOff className="w-5 h-5" />
          <span>{t(lang, 'endCall')}</span>
        </button>
      </footer>
    </div>
  );
}
