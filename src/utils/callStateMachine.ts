import type { CallType } from '../types/domain';

export type CallPhase =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'active'
  | 'ended';

export type CallEndReason =
  | 'hangup'
  | 'rejected'
  | 'busy'
  | 'missed'
  | 'offline'
  | 'failed';

export interface CallPeerInfo {
  uid: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
}

export interface CallSessionState {
  phase: CallPhase;
  callId: string | null;
  callType: CallType;
  peer: CallPeerInfo | null;
  isCaller: boolean;
  peerRinging: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isSpeakerOn: boolean;
  facingMode: 'user' | 'environment';
  peerMuted: boolean;
  peerCameraOff: boolean;
  startedAtMs: number | null;
  connectedAtMs: number | null;
  endReason: CallEndReason | null;
}

export const INITIAL_CALL_STATE: CallSessionState = {
  phase: 'idle',
  callId: null,
  callType: 'video',
  peer: null,
  isCaller: false,
  peerRinging: false,
  isMuted: false,
  isCameraOff: false,
  isSpeakerOn: true,
  facingMode: 'user',
  peerMuted: false,
  peerCameraOff: false,
  startedAtMs: null,
  connectedAtMs: null,
  endReason: null,
};

export type CallAction =
  | { type: 'START_OUTGOING'; callId: string; callType: CallType; peer: CallPeerInfo; nowMs: number }
  | { type: 'RECEIVE_INCOMING'; callId: string; callType: CallType; peer: CallPeerInfo; nowMs: number }
  | { type: 'PEER_RINGING' }
  | { type: 'ACCEPT_OR_CONNECT'; nowMs: number }
  | { type: 'MARK_ACTIVE'; nowMs: number }
  | { type: 'END_CALL'; reason: CallEndReason }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'TOGGLE_CAMERA' }
  | { type: 'TOGGLE_SPEAKER' }
  | { type: 'SWITCH_CAMERA' }
  | { type: 'SET_PEER_MEDIA'; peerMuted?: boolean; peerCameraOff?: boolean }
  | { type: 'RESET' };

export function callReducer(state: CallSessionState, action: CallAction): CallSessionState {
  switch (action.type) {
    case 'START_OUTGOING': {
      if (state.phase !== 'idle' && state.phase !== 'ended') {
        return state;
      }
      return {
        ...INITIAL_CALL_STATE,
        phase: 'outgoing',
        callId: action.callId,
        callType: action.callType,
        peer: action.peer,
        isCaller: true,
        isCameraOff: action.callType === 'voice',
        startedAtMs: action.nowMs,
      };
    }
    case 'RECEIVE_INCOMING': {
      if (state.phase !== 'idle' && state.phase !== 'ended') {
        return state;
      }
      return {
        ...INITIAL_CALL_STATE,
        phase: 'incoming',
        callId: action.callId,
        callType: action.callType,
        peer: action.peer,
        isCaller: false,
        isCameraOff: action.callType === 'voice',
        startedAtMs: action.nowMs,
      };
    }
    case 'PEER_RINGING': {
      if (state.phase !== 'outgoing') return state;
      return { ...state, peerRinging: true };
    }
    case 'ACCEPT_OR_CONNECT': {
      if (state.phase !== 'incoming' && state.phase !== 'outgoing') {
        return state;
      }
      return {
        ...state,
        phase: 'connecting',
      };
    }
    case 'MARK_ACTIVE': {
      if (state.phase !== 'connecting' && state.phase !== 'outgoing' && state.phase !== 'incoming') {
        return state;
      }
      return {
        ...state,
        phase: 'active',
        connectedAtMs: state.connectedAtMs ?? action.nowMs,
      };
    }
    case 'END_CALL': {
      if (state.phase === 'idle') return state;
      return {
        ...state,
        phase: 'ended',
        endReason: action.reason,
      };
    }
    case 'TOGGLE_MUTE':
      return { ...state, isMuted: !state.isMuted };
    case 'TOGGLE_CAMERA':
      return { ...state, isCameraOff: !state.isCameraOff };
    case 'TOGGLE_SPEAKER':
      return { ...state, isSpeakerOn: !state.isSpeakerOn };
    case 'SWITCH_CAMERA':
      return {
        ...state,
        facingMode: state.facingMode === 'user' ? 'environment' : 'user',
      };
    case 'SET_PEER_MEDIA':
      return {
        ...state,
        peerMuted: action.peerMuted ?? state.peerMuted,
        peerCameraOff: action.peerCameraOff ?? state.peerCameraOff,
      };
    case 'RESET':
      return { ...INITIAL_CALL_STATE };
    default:
      return state;
  }
}
