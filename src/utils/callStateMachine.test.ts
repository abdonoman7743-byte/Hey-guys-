import test from 'node:test';
import assert from 'node:assert/strict';
import { callReducer, INITIAL_CALL_STATE } from './callStateMachine';

const peer = { uid: 'peer_1', displayName: 'Nadia', username: 'nadia' };

test('outgoing call transitions from idle -> outgoing -> connecting -> active -> ended', () => {
  let state = callReducer(INITIAL_CALL_STATE, {
    type: 'START_OUTGOING',
    callId: 'call_1',
    callType: 'video',
    peer,
    nowMs: 1000,
  });
  assert.equal(state.phase, 'outgoing');
  assert.equal(state.isCaller, true);
  assert.equal(state.isCameraOff, false);

  state = callReducer(state, { type: 'PEER_RINGING' });
  assert.equal(state.peerRinging, true);

  state = callReducer(state, { type: 'ACCEPT_OR_CONNECT', nowMs: 2000 });
  assert.equal(state.phase, 'connecting');

  state = callReducer(state, { type: 'MARK_ACTIVE', nowMs: 3000 });
  assert.equal(state.phase, 'active');
  assert.equal(state.connectedAtMs, 3000);

  state = callReducer(state, { type: 'END_CALL', reason: 'hangup' });
  assert.equal(state.phase, 'ended');
  assert.equal(state.endReason, 'hangup');
});

test('voice call defaults camera off and toggles mute/speaker/camera', () => {
  let state = callReducer(INITIAL_CALL_STATE, {
    type: 'RECEIVE_INCOMING',
    callId: 'call_2',
    callType: 'voice',
    peer,
    nowMs: 1000,
  });
  assert.equal(state.phase, 'incoming');
  assert.equal(state.isCameraOff, true);

  state = callReducer(state, { type: 'TOGGLE_MUTE' });
  assert.equal(state.isMuted, true);

  state = callReducer(state, { type: 'TOGGLE_SPEAKER' });
  assert.equal(state.isSpeakerOn, false);

  state = callReducer(state, { type: 'SWITCH_CAMERA' });
  assert.equal(state.facingMode, 'environment');
});

test('cannot overwrite an already active call with a second incoming call', () => {
  let state = callReducer(INITIAL_CALL_STATE, {
    type: 'START_OUTGOING',
    callId: 'call_1',
    callType: 'video',
    peer,
    nowMs: 1000,
  });
  state = callReducer(state, { type: 'MARK_ACTIVE', nowMs: 2000 });
  const next = callReducer(state, {
    type: 'RECEIVE_INCOMING',
    callId: 'call_2',
    callType: 'voice',
    peer: { uid: 'peer_2', displayName: 'Sam', username: 'sam' },
    nowMs: 3000,
  });
  assert.equal(next.callId, 'call_1');
  assert.equal(next.phase, 'active');
});
