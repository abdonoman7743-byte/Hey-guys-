import type { Server, Socket } from 'socket.io';

import type { UserPushNotifier, UserPushRequest } from './pushService';

export type TokenVerifier = (token: string) => Promise<{ uid: string; email?: string }>;

export interface UserPresenceRecord {
  uid: string;
  status: 'online' | 'busy' | 'offline';
  manualStatus: 'available' | 'busy';
  lastSeen: number;
}

interface ActiveCallEntry {
  callId: string;
  peerUid: string;
  state: 'ringing' | 'active';
}

export function attachSignalingServer(
  io: Server,
  verifyToken: TokenVerifier,
  pushNotify?: UserPushNotifier
) {
  const push = (req: UserPushRequest) => {
    if (!pushNotify) return;
    pushNotify(req).catch(() => {});
  };
  const userSockets = new Map<string, Set<string>>();
  const presenceMap = new Map<string, UserPresenceRecord>();
  const activeCalls = new Map<string, ActiveCallEntry>();

  const computeStatus = (uid: string): 'online' | 'busy' | 'offline' => {
    const sockets = userSockets.get(uid);
    if (!sockets || sockets.size === 0) return 'offline';
    if (activeCalls.has(uid)) return 'busy';
    const rec = presenceMap.get(uid);
    if (rec?.manualStatus === 'busy') return 'busy';
    return 'online';
  };

  const broadcastPresence = (uid: string) => {
    const existing = presenceMap.get(uid);
    const status = computeStatus(uid);
    const updated: UserPresenceRecord = {
      uid,
      status,
      manualStatus: existing?.manualStatus || 'available',
      lastSeen: Date.now(),
    };
    presenceMap.set(uid, updated);
    io.emit('presence:changed', updated);
  };

  // A call-scoped message is only relayed between the two parties of that exact call.
  const inCallWith = (uid: string, toUid: unknown, callId: unknown): boolean => {
    if (typeof toUid !== 'string' || typeof callId !== 'string') return false;
    const entry = activeCalls.get(uid);
    return !!entry && entry.callId === callId && entry.peerUid === toUid;
  };

  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') as string | undefined);

    if (!token) {
      return next(new Error('Unauthorized: missing auth token'));
    }

    try {
      const decoded = await verifyToken(token);
      socket.data.uid = decoded.uid;
      socket.data.email = decoded.email || '';
      return next();
    } catch {
      return next(new Error('Unauthorized: invalid auth token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const uid = socket.data.uid as string;
    socket.join(`user:${uid}`);

    if (!userSockets.has(uid)) {
      userSockets.set(uid, new Set());
    }
    userSockets.get(uid)!.add(socket.id);

    if (!presenceMap.has(uid)) {
      presenceMap.set(uid, {
        uid,
        status: 'online',
        manualStatus: 'available',
        lastSeen: Date.now(),
      });
    }
    broadcastPresence(uid);

    socket.on('presence:set', (payload: { manualStatus?: 'available' | 'busy' }) => {
      if (payload?.manualStatus !== 'available' && payload?.manualStatus !== 'busy') return;
      const current = presenceMap.get(uid) || {
        uid,
        status: 'online',
        manualStatus: 'available',
        lastSeen: Date.now(),
      };
      presenceMap.set(uid, { ...current, manualStatus: payload.manualStatus });
      broadcastPresence(uid);
    });

    socket.on(
      'presence:query',
      (uids: string[], callback?: (result: Record<string, UserPresenceRecord>) => void) => {
        if (!Array.isArray(uids) || typeof callback !== 'function') return;
        const result: Record<string, UserPresenceRecord> = {};
        for (const targetUid of uids.slice(0, 200)) {
          if (typeof targetUid !== 'string') continue;
          const rec = presenceMap.get(targetUid);
          if (rec) {
            result[targetUid] = {
              ...rec,
              status: computeStatus(targetUid),
            };
          }
        }
        callback(result);
      }
    );

    socket.on('typing:start', (payload: { toUid: string; conversationId: string }) => {
      if (!payload?.toUid || !payload?.conversationId) return;
      io.to(`user:${payload.toUid}`).emit('typing:start', {
        fromUid: uid,
        conversationId: payload.conversationId,
      });
    });

    socket.on('typing:stop', (payload: { toUid: string; conversationId: string }) => {
      if (!payload?.toUid || !payload?.conversationId) return;
      io.to(`user:${payload.toUid}`).emit('typing:stop', {
        fromUid: uid,
        conversationId: payload.conversationId,
      });
    });

    socket.on(
      'message:notify',
      (payload: { toUid: string; conversationId: string; preview: string; senderName: string }) => {
        if (!payload?.toUid || !payload?.conversationId) return;
        if (!userSockets.get(payload.toUid)?.size) {
          push({
            senderUid: uid,
            recipientUid: payload.toUid,
            kind: 'message',
            preview: String(payload.preview || ''),
          });
        }
        io.to(`user:${payload.toUid}`).emit('message:notify', {
          fromUid: uid,
          conversationId: payload.conversationId,
          preview: String(payload.preview || '').slice(0, 140),
          senderName: String(payload.senderName || '').slice(0, 60),
        });
      }
    );

    socket.on('friend:event', (payload: { toUid: string; kind: 'request' | 'accepted' }) => {
      if (!payload?.toUid) return;
      if (!userSockets.get(payload.toUid)?.size) {
        push({
          senderUid: uid,
          recipientUid: payload.toUid,
          kind: payload.kind === 'accepted' ? 'friend_accepted' : 'friend_request',
        });
      }
      io.to(`user:${payload.toUid}`).emit('friend:event', {
        fromUid: uid,
        kind: payload.kind,
      });
    });

    // --- WebRTC Call Signaling ---
    socket.on(
      'call:initiate',
      (payload: {
        callId: string;
        toUid: string;
        callType: 'video' | 'voice';
        callerName: string;
        callerUsername: string;
        callerAvatarUrl?: string;
      }) => {
        const { callId, toUid, callType, callerName, callerUsername, callerAvatarUrl } =
          payload || {};
        if (
          typeof callId !== 'string' ||
          typeof toUid !== 'string' ||
          !callId ||
          callId.length > 128 ||
          toUid === uid ||
          (callType !== 'video' && callType !== 'voice')
        )
          return;
        if (activeCalls.has(uid)) {
          socket.emit('call:busy', { callId, toUid });
          return;
        }

        // Check if callee is already in an active/ringing call
        if (activeCalls.has(toUid)) {
          socket.emit('call:busy', { callId, toUid });
          return;
        }

        // Always push calls: a backgrounded mobile client may have a dead socket.
        push({ senderUid: uid, recipientUid: toUid, kind: 'call', refId: callId, callType });

        const calleeSockets = userSockets.get(toUid);
        if (!calleeSockets || calleeSockets.size === 0) {
          socket.emit('call:peer-offline', { callId, toUid });
          return;
        }

        activeCalls.set(uid, { callId, peerUid: toUid, state: 'ringing' });
        activeCalls.set(toUid, { callId, peerUid: uid, state: 'ringing' });
        broadcastPresence(uid);
        broadcastPresence(toUid);

        io.to(`user:${toUid}`).emit('call:incoming', {
          callId,
          fromUid: uid,
          callType,
          callerName: String(callerName || '').slice(0, 60),
          callerUsername: String(callerUsername || '').slice(0, 40),
          callerAvatarUrl: String(callerAvatarUrl || '').slice(0, 500),
        });

        socket.emit('call:ringing', { callId, toUid });
      }
    );

    socket.on('call:accept', (payload: { callId: string; toUid: string }) => {
      if (!payload?.callId || !payload?.toUid) return;
      if (!inCallWith(uid, payload.toUid, payload.callId)) return;
      const entry = activeCalls.get(uid);
      if (entry && entry.callId === payload.callId) {
        activeCalls.set(uid, { ...entry, state: 'active' });
      }
      const peerEntry = activeCalls.get(payload.toUid);
      if (peerEntry && peerEntry.callId === payload.callId) {
        activeCalls.set(payload.toUid, { ...peerEntry, state: 'active' });
      }
      io.to(`user:${payload.toUid}`).emit('call:accepted', {
        callId: payload.callId,
        fromUid: uid,
      });
    });

    socket.on('call:reject', (payload: { callId: string; toUid: string; reason?: string }) => {
      if (!payload?.callId || !payload?.toUid) return;
      if (!inCallWith(uid, payload.toUid, payload.callId)) return;
      if (activeCalls.get(uid)?.callId === payload.callId) activeCalls.delete(uid);
      if (activeCalls.get(payload.toUid)?.callId === payload.callId) activeCalls.delete(payload.toUid);
      broadcastPresence(uid);
      broadcastPresence(payload.toUid);
      io.to(`user:${payload.toUid}`).emit('call:rejected', {
        callId: payload.callId,
        fromUid: uid,
        reason: payload.reason || 'rejected',
      });
    });

    socket.on(
      'call:offer',
      (payload: { callId: string; toUid: string; sdp: RTCSessionDescriptionInit }) => {
        if (!payload?.callId || !payload?.toUid || !payload?.sdp) return;
      if (!inCallWith(uid, payload.toUid, payload.callId)) return;
        io.to(`user:${payload.toUid}`).emit('call:offer', {
          callId: payload.callId,
          fromUid: uid,
          sdp: payload.sdp,
        });
      }
    );

    socket.on(
      'call:answer',
      (payload: { callId: string; toUid: string; sdp: RTCSessionDescriptionInit }) => {
        if (!payload?.callId || !payload?.toUid || !payload?.sdp) return;
      if (!inCallWith(uid, payload.toUid, payload.callId)) return;
        io.to(`user:${payload.toUid}`).emit('call:answer', {
          callId: payload.callId,
          fromUid: uid,
          sdp: payload.sdp,
        });
      }
    );

    socket.on(
      'call:ice-candidate',
      (payload: { callId: string; toUid: string; candidate: RTCIceCandidateInit }) => {
        if (!payload?.callId || !payload?.toUid || !payload?.candidate) return;
      if (!inCallWith(uid, payload.toUid, payload.callId)) return;
        io.to(`user:${payload.toUid}`).emit('call:ice-candidate', {
          callId: payload.callId,
          fromUid: uid,
          candidate: payload.candidate,
        });
      }
    );

    socket.on(
      'call:media-state',
      (payload: { callId: string; toUid: string; isMuted?: boolean; isCameraOff?: boolean }) => {
        if (!payload?.callId || !payload?.toUid) return;
      if (!inCallWith(uid, payload.toUid, payload.callId)) return;
        io.to(`user:${payload.toUid}`).emit('call:media-state', {
          callId: payload.callId,
          fromUid: uid,
          isMuted: payload.isMuted,
          isCameraOff: payload.isCameraOff,
        });
      }
    );

    socket.on('call:hangup', (payload: { callId: string; toUid: string; reason?: string }) => {
      if (!payload?.callId || !payload?.toUid) return;
      if (!inCallWith(uid, payload.toUid, payload.callId)) return;
      if (activeCalls.get(uid)?.callId === payload.callId) activeCalls.delete(uid);
      if (activeCalls.get(payload.toUid)?.callId === payload.callId) activeCalls.delete(payload.toUid);
      broadcastPresence(uid);
      broadcastPresence(payload.toUid);
      io.to(`user:${payload.toUid}`).emit('call:ended', {
        callId: payload.callId,
        fromUid: uid,
        reason: payload.reason || 'hangup',
      });
    });

    socket.on('disconnect', () => {
      const sockets = userSockets.get(uid);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(uid);
          const active = activeCalls.get(uid);
          if (active) {
            activeCalls.delete(uid);
            if (activeCalls.get(active.peerUid)?.callId === active.callId) {
              activeCalls.delete(active.peerUid);
              broadcastPresence(active.peerUid);
            }
            io.to(`user:${active.peerUid}`).emit('call:ended', {
              callId: active.callId,
              fromUid: uid,
              reason: 'disconnect',
            });
          }
        }
      }
      broadcastPresence(uid);
    });
  });

  return { userSockets, presenceMap, activeCalls };
}
