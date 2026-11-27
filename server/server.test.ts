import test from 'node:test';
import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import { buildRtcConfig } from './rtcConfig';
import { createAppServer } from '../server';

test('buildRtcConfig returns STUN defaults and includes TURN when credentials are provided', () => {
  const defaultCfg = buildRtcConfig({});
  assert.equal(defaultCfg.hasTurn, false);
  assert.ok(defaultCfg.iceServers.length === 1);

  const withTurn = buildRtcConfig({
    STUN_URLS: 'stun:stun.example.com:3478',
    TURN_URLS: 'turn:turn.example.com:3478,turns:turn.example.com:5349',
    TURN_USERNAME: 'alice',
    TURN_CREDENTIAL: 'secret',
  });
  assert.equal(withTurn.hasTurn, true);
  assert.equal(withTurn.iceServers.length, 2);
  assert.equal(withTurn.iceServers[1].username, 'alice');
});

test('API endpoints enforce authentication and Socket.IO relays WebRTC signaling between two real clients', async () => {
  const mockVerifier = async (token: string) => {
    if (token === 'token-alice') return { uid: 'alice_uid', email: 'alice@example.com' };
    if (token === 'token-bob') return { uid: 'bob_uid', email: 'bob@example.com' };
    throw new Error('Invalid token');
  };

  const { httpServer } = createAppServer({ verifyToken: mockVerifier });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Unauthenticated /api/rtc-config is rejected with 401
    const unauthedRes = await fetch(`${baseUrl}/api/rtc-config`);
    assert.equal(unauthedRes.status, 401);

    // 2. Authenticated /api/rtc-config succeeds
    const authedRes = await fetch(`${baseUrl}/api/rtc-config`, {
      headers: { Authorization: 'Bearer token-alice' },
    });
    assert.equal(authedRes.status, 200);
    const rtcBody = (await authedRes.json()) as { iceServers: unknown[] };
    assert.ok(Array.isArray(rtcBody.iceServers));

    // 3. Connect two real Socket.IO clients and test presence + call signaling
    const aliceSocket = ioClient(baseUrl, {
      auth: { token: 'token-alice' },
      transports: ['websocket'],
    });
    const bobSocket = ioClient(baseUrl, {
      auth: { token: 'token-bob' },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => aliceSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => bobSocket.on('connect', () => resolve())),
    ]);

    // Query live presence
    const queried = await new Promise<Record<string, { status: string }>>((resolve) => {
      aliceSocket.emit('presence:query', ['bob_uid'], (res: Record<string, { status: string }>) => {
        resolve(res);
      });
    });
    assert.equal(queried.bob_uid.status, 'online');

    // Call initiate -> Bob receives call:incoming, Alice receives call:ringing
    const incomingPromise = new Promise<any>((resolve) => {
      bobSocket.once('call:incoming', resolve);
    });
    const ringingPromise = new Promise<any>((resolve) => {
      aliceSocket.once('call:ringing', resolve);
    });

    aliceSocket.emit('call:initiate', {
      callId: 'call_test_1',
      toUid: 'bob_uid',
      callType: 'video',
      callerName: 'Alice',
      callerUsername: 'alice',
    });

    const [incoming, ringing] = await Promise.all([incomingPromise, ringingPromise]);
    assert.equal(incoming.callId, 'call_test_1');
    assert.equal(incoming.fromUid, 'alice_uid');
    assert.equal(ringing.callId, 'call_test_1');

    // Bob accepts -> Alice receives call:accepted
    const acceptedPromise = new Promise<any>((resolve) => {
      aliceSocket.once('call:accepted', resolve);
    });
    bobSocket.emit('call:accept', { callId: 'call_test_1', toUid: 'alice_uid' });
    const accepted = await acceptedPromise;
    assert.equal(accepted.fromUid, 'bob_uid');

    // Offer / Answer SDP relay
    const offerPromise = new Promise<any>((resolve) => {
      bobSocket.once('call:offer', resolve);
    });
    aliceSocket.emit('call:offer', {
      callId: 'call_test_1',
      toUid: 'bob_uid',
      sdp: { type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' },
    });
    const relayedOffer = await offerPromise;
    assert.equal(relayedOffer.fromUid, 'alice_uid');
    assert.equal(relayedOffer.sdp.type, 'offer');

    // Hangup -> peer receives call:ended
    const endedPromise = new Promise<any>((resolve) => {
      bobSocket.once('call:ended', resolve);
    });
    aliceSocket.emit('call:hangup', { callId: 'call_test_1', toUid: 'bob_uid', reason: 'hangup' });
    const ended = await endedPromise;
    assert.equal(ended.callId, 'call_test_1');

    aliceSocket.disconnect();
    bobSocket.disconnect();
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

test('server triggers push for offline message, friend request and incoming call', async () => {
  const mockVerifier = async (token: string) => {
    if (token === 'token-alice') return { uid: 'alice_uid' };
    throw new Error('Invalid token');
  };
  const calls: any[] = [];
  const { httpServer } = createAppServer({
    verifyToken: mockVerifier,
    pushNotifier: async (r) => {
      calls.push(r);
      return null;
    },
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as { port: number };
  const alice = ioClient(`http://127.0.0.1:${address.port}`, {
    auth: { token: 'token-alice' },
    transports: ['websocket'],
  });
  try {
    await new Promise<void>((resolve) => alice.on('connect', () => resolve()));
    alice.emit('message:notify', { toUid: 'bob_uid', conversationId: 'c1', preview: 'hi', senderName: 'A' });
    alice.emit('friend:event', { toUid: 'bob_uid', kind: 'request' });
    alice.emit('call:initiate', { callId: 'call1', toUid: 'bob_uid', callType: 'voice', callerName: 'A', callerUsername: 'alice' });
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(calls.map((c) => c.kind), ['message', 'friend_request', 'call']);
    assert.ok(calls.every((c) => c.senderUid === 'alice_uid' && c.recipientUid === 'bob_uid'));
  } finally {
    alice.close();
    httpServer.close();
  }
});
