import {
  collection,
  deleteDoc,
  doc,
  enableNetwork,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import type {
  AppNotification,
  CallRecord,
  CallRecordStatus,
  CallType,
  Conversation,
  FriendRequest,
  Friendship,
  ManualStatus,
  Message,
  PresenceStatus,
  PrivateUser,
  PublicProfile,
  SupportedLanguage,
  ThemeMode,
} from '../types/domain';
import {
  getDeterministicPairId,
  getSortedParticipants,
  normalizeUsername,
  sanitizeMessageText,
} from '../utils/chatUtils';

function isTransientOfflineError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { code?: string; message?: string };
  if (maybe.code === 'unavailable') return true;
  const msg = (maybe.message || '').toLowerCase();
  return msg.includes('the client is offline') || msg.includes('client is offline');
}

async function withFirestoreRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientOfflineError(err) || attempt === maxRetries) {
        throw err;
      }
      await enableNetwork(db).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function getUserAccount(uid: string): Promise<{
  privateUser: PrivateUser | null;
  publicProfile: PublicProfile | null;
}> {
  try {
    const [privSnap, pubSnap] = await withFirestoreRetry(() =>
      Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'publicProfiles', uid)),
      ])
    );
    return {
      privateUser: privSnap.exists() ? (privSnap.data() as PrivateUser) : null,
      publicProfile: pubSnap.exists() ? (pubSnap.data() as PublicProfile) : null,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }
}

export async function checkUsernameAvailability(rawUsername: string): Promise<boolean> {
  const uname = normalizeUsername(rawUsername);
  if (!uname) return false;
  try {
    const snap = await withFirestoreRetry(() => getDoc(doc(db, 'usernames', uname)));
    return !snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `usernames/${uname}`);
  }
}

export async function registerUserProfile(params: {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  preferredLanguage: SupportedLanguage;
  theme: ThemeMode;
}): Promise<void> {
  const uname = normalizeUsername(params.username);
  const display = params.displayName.trim().slice(0, 60);
  const bio = (params.bio || '').trim().slice(0, 160);
  const avatarUrl = (params.avatarUrl || '').trim().slice(0, 500);

  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', uname), {
    uid: params.uid,
    username: uname,
    createdAt: serverTimestamp(),
  });

  const publicData: Record<string, unknown> = {
    uid: params.uid,
    username: uname,
    usernameLower: uname,
    displayName: display,
    displayNameLower: display.toLowerCase(),
    bio,
    status: 'online',
    manualStatus: 'available',
    lastSeen: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (avatarUrl) {
    publicData.avatarUrl = avatarUrl;
  }

  batch.set(doc(db, 'publicProfiles', params.uid), publicData);
  batch.set(doc(db, 'users', params.uid), {
    uid: params.uid,
    email: params.email.slice(0, 150),
    username: uname,
    displayName: display,
    preferredLanguage: params.preferredLanguage,
    theme: params.theme,
    notificationsEnabled: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `publicProfiles/${params.uid}`);
  }
}

export async function updateUserSettings(
  uid: string,
  updates: {
    displayName?: string;
    bio?: string;
    manualStatus?: ManualStatus;
    status?: PresenceStatus;
    preferredLanguage?: SupportedLanguage;
    theme?: ThemeMode;
    notificationsEnabled?: boolean;
  }
): Promise<void> {
  const batch = writeBatch(db);
  const pubUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  };
  const privUpdates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof updates.displayName === 'string' && updates.displayName.trim()) {
    const cleanName = updates.displayName.trim().slice(0, 60);
    pubUpdates.displayName = cleanName;
    pubUpdates.displayNameLower = cleanName.toLowerCase();
    privUpdates.displayName = cleanName;
  }
  if (typeof updates.bio === 'string') {
    pubUpdates.bio = updates.bio.trim().slice(0, 160);
  }
  if (updates.manualStatus) {
    pubUpdates.manualStatus = updates.manualStatus;
    pubUpdates.status = updates.manualStatus === 'busy' ? 'busy' : 'online';
  } else if (updates.status) {
    pubUpdates.status = updates.status;
  }
  if (updates.preferredLanguage) {
    privUpdates.preferredLanguage = updates.preferredLanguage;
  }
  if (updates.theme) {
    privUpdates.theme = updates.theme;
  }
  if (typeof updates.notificationsEnabled === 'boolean') {
    privUpdates.notificationsEnabled = updates.notificationsEnabled;
  }

  batch.update(doc(db, 'publicProfiles', uid), pubUpdates);
  if (Object.keys(privUpdates).length > 1) {
    batch.update(doc(db, 'users', uid), privUpdates);
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function syncPresenceToFirestore(
  uid: string,
  status: PresenceStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, 'publicProfiles', uid), {
      status,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Presence sync errors during unload are non-fatal
  }
}

export async function searchGlobalUsers(
  rawQuery: string,
  currentUid: string
): Promise<PublicProfile[]> {
  const cleaned = normalizeUsername(rawQuery);
  const nameLower = rawQuery.trim().toLowerCase();
  if (!cleaned && !nameLower) return [];

  try {
    const resultsMap = new Map<string, PublicProfile>();

    if (cleaned) {
      const qByUsername = query(
        collection(db, 'publicProfiles'),
        orderBy('usernameLower'),
        where('usernameLower', '>=', cleaned),
        where('usernameLower', '<=', `${cleaned}\uf8ff`),
        limit(15)
      );
      const snap = await getDocs(qByUsername);
      snap.forEach((d) => {
        if (d.id !== currentUid) {
          resultsMap.set(d.id, d.data() as PublicProfile);
        }
      });
    }

    if (nameLower) {
      const qByName = query(
        collection(db, 'publicProfiles'),
        orderBy('displayNameLower'),
        where('displayNameLower', '>=', nameLower),
        where('displayNameLower', '<=', `${nameLower}\uf8ff`),
        limit(15)
      );
      const snap2 = await getDocs(qByName);
      snap2.forEach((d) => {
        if (d.id !== currentUid) {
          resultsMap.set(d.id, d.data() as PublicProfile);
        }
      });
    }

    return Array.from(resultsMap.values());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'publicProfiles');
  }
}

export async function sendFriendRequest(
  fromProfile: PublicProfile,
  toProfile: PublicProfile
): Promise<string> {
  const requestId = `${fromProfile.uid}__${toProfile.uid}`;
  try {
    const existingRef = doc(db, 'friendRequests', requestId);
    const existingSnap = await getDoc(existingRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data() as FriendRequest;
      if (data.status === 'pending') {
        return requestId;
      }
      // Clean up old rejected/cancelled request before creating fresh request
      await deleteDoc(existingRef);
    }

    const batch = writeBatch(db);
    const reqPayload: Record<string, unknown> = {
      fromUid: fromProfile.uid,
      toUid: toProfile.uid,
      participantUids: [fromProfile.uid, toProfile.uid],
      fromUsername: fromProfile.username,
      fromDisplayName: fromProfile.displayName,
      toUsername: toProfile.username,
      toDisplayName: toProfile.displayName,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (fromProfile.avatarUrl) reqPayload.fromAvatarUrl = fromProfile.avatarUrl;
    if (toProfile.avatarUrl) reqPayload.toAvatarUrl = toProfile.avatarUrl;

    batch.set(existingRef, reqPayload);

    const notifId = `fr_${fromProfile.uid}_${toProfile.uid}_${Date.now()}`;
    batch.set(doc(db, 'notifications', notifId), {
      recipientUid: toProfile.uid,
      senderUid: fromProfile.uid,
      senderName: fromProfile.displayName,
      senderUsername: fromProfile.username,
      type: 'friend_request',
      title: fromProfile.displayName,
      body: `@${fromProfile.username} sent you a friend request`,
      read: false,
      refId: requestId,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return requestId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `friendRequests/${requestId}`);
  }
}

export async function respondToFriendRequest(
  request: FriendRequest,
  action: 'accepted' | 'rejected' | 'cancelled',
  currentUserProfile: PublicProfile
): Promise<void> {
  const batch = writeBatch(db);
  const reqRef = doc(db, 'friendRequests', request.id);

  batch.update(reqRef, {
    status: action,
    updatedAt: serverTimestamp(),
  });

  if (action === 'accepted') {
    const pairId = getDeterministicPairId(request.fromUid, request.toUid);
    const [userA, userB] = getSortedParticipants(request.fromUid, request.toUid);

    batch.set(doc(db, 'friendships', pairId), {
      pairId,
      userA,
      userB,
      participantUids: [userA, userB],
      requestId: request.id,
      createdAt: serverTimestamp(),
    });

    batch.set(doc(db, 'conversations', pairId), {
      conversationId: pairId,
      participantUids: [userA, userB],
      lastMessageText: '',
      lastMessageSenderUid: currentUserProfile.uid,
      lastMessageType: 'system',
      lastMessageAt: serverTimestamp(),
      unreadA: 0,
      unreadB: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const notifId = `fa_${currentUserProfile.uid}_${request.fromUid}_${Date.now()}`;
    batch.set(doc(db, 'notifications', notifId), {
      recipientUid: request.fromUid,
      senderUid: currentUserProfile.uid,
      senderName: currentUserProfile.displayName,
      senderUsername: currentUserProfile.username,
      type: 'friend_accepted',
      title: currentUserProfile.displayName,
      body: `@${currentUserProfile.username} accepted your friend request`,
      read: false,
      refId: pairId,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `friendRequests/${request.id}`);
  }
}

export async function removeFriendship(pairId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendships', pairId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `friendships/${pairId}`);
  }
}

export async function sendMessage(params: {
  conversationId: string;
  participantUids: string[];
  senderUid: string;
  text: string;
  replyTo?: { id: string; preview: string } | null;
}): Promise<string> {
  const cleanText = sanitizeMessageText(params.text);
  if (!cleanText) return '';

  const msgId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const batch = writeBatch(db);

  const msgData: Record<string, unknown> = {
    id: msgId,
    conversationId: params.conversationId,
    senderUid: params.senderUid,
    participantUids: params.participantUids,
    type: 'text',
    text: cleanText,
    status: 'sent',
    createdAt: serverTimestamp(),
  };

  if (params.replyTo) {
    msgData.replyToId = params.replyTo.id;
    msgData.replyToPreview = params.replyTo.preview.slice(0, 200);
  }

  batch.set(
    doc(db, 'conversations', params.conversationId, 'messages', msgId),
    msgData
  );

  batch.update(doc(db, 'conversations', params.conversationId), {
    lastMessageText: cleanText.slice(0, 2000),
    lastMessageSenderUid: params.senderUid,
    lastMessageType: 'text',
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return msgId;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `conversations/${params.conversationId}/messages/${msgId}`
    );
  }
}

export async function markMessagesAsRead(
  conversationId: string,
  messages: Message[],
  currentUid: string
): Promise<void> {
  const unreadFromPeer = messages.filter(
    (m) => m.senderUid !== currentUid && m.status !== 'read'
  );
  if (unreadFromPeer.length === 0) return;

  const batch = writeBatch(db);
  for (const m of unreadFromPeer.slice(0, 30)) {
    batch.update(doc(db, 'conversations', conversationId, 'messages', m.id), {
      status: 'read',
      readAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `conversations/${conversationId}/messages`);
  }
}

export async function createCallRecord(params: {
  callId: string;
  caller: PublicProfile;
  callee: PublicProfile;
  type: CallType;
}): Promise<void> {
  const data: Record<string, unknown> = {
    callId: params.callId,
    callerUid: params.caller.uid,
    calleeUid: params.callee.uid,
    participantUids: [params.caller.uid, params.callee.uid],
    callerName: params.caller.displayName,
    callerUsername: params.caller.username,
    calleeName: params.callee.displayName,
    calleeUsername: params.callee.username,
    type: params.type,
    status: 'ringing',
    durationSeconds: 0,
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (params.caller.avatarUrl) data.callerAvatarUrl = params.caller.avatarUrl;
  if (params.callee.avatarUrl) data.calleeAvatarUrl = params.callee.avatarUrl;

  try {
    await setDoc(doc(db, 'calls', params.callId), data);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `calls/${params.callId}`);
  }
}

export async function updateCallRecord(
  callId: string,
  status: CallRecordStatus,
  durationSeconds: number,
  isTerminal: boolean
): Promise<void> {
  const updates: Record<string, unknown> = {
    status,
    durationSeconds: Math.max(0, Math.floor(durationSeconds)),
    updatedAt: serverTimestamp(),
  };
  if (isTerminal) {
    updates.endedAt = serverTimestamp();
  }

  try {
    await updateDoc(doc(db, 'calls', callId), updates);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `calls/${callId}`);
  }
}

export async function createMissedCallNotification(params: {
  recipientUid: string;
  caller: PublicProfile;
  callId: string;
  callType: CallType;
}): Promise<void> {
  const notifId = `mc_${params.callId}`;
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      recipientUid: params.recipientUid,
      senderUid: params.caller.uid,
      senderName: params.caller.displayName,
      senderUsername: params.caller.username,
      type: 'missed_call',
      title: params.caller.displayName,
      body:
        params.callType === 'video'
          ? `Missed video call from @${params.caller.username}`
          : `Missed voice call from @${params.caller.username}`,
      read: false,
      refId: params.callId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `notifications/${notifId}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function registerDeviceToken(
  uid: string,
  token: string,
  platform: 'web' | 'ios' | 'android' = 'web',
  provider: 'fcm' | 'apns' | 'webpush' = 'webpush'
): Promise<void> {
  const tokenId = `tok_${uid.slice(0, 12)}_${platform}`;
  try {
    await setDoc(doc(db, 'users', uid, 'deviceTokens', tokenId), {
      uid,
      token: token.slice(0, 512),
      platform,
      provider,
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown').slice(0, 200),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/deviceTokens/${tokenId}`);
  }
}

// --- Real-Time Listeners ---

export function subscribeFriendRequests(
  uid: string,
  onData: (requests: FriendRequest[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'friendRequests'),
    where('participantUids', 'array-contains', uid),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FriendRequest)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests')
  );
}

export function subscribeFriendships(
  uid: string,
  onData: (friendships: Friendship[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'friendships'),
    where('participantUids', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Friendship));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
  );
}

export function subscribeConversations(
  uid: string,
  onData: (conversations: Conversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('participantUids', 'array-contains', uid),
    orderBy('lastMessageAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Conversation));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
  );
}

export function subscribeMessages(
  conversationId: string,
  onData: (messages: Message[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Message));
    },
    (err) =>
      handleFirestoreError(err, OperationType.LIST, `conversations/${conversationId}/messages`)
  );
}

export function subscribeCalls(
  uid: string,
  onData: (calls: CallRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'calls'),
    where('participantUids', 'array-contains', uid),
    orderBy('startedAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as CallRecord));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'calls')
  );
}

export function subscribeNotifications(
  uid: string,
  onData: (notifications: AppNotification[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'notifications'),
    where('recipientUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export async function fetchProfilesByUids(uids: string[]): Promise<Record<string, PublicProfile>> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const result: Record<string, PublicProfile> = {};
  if (unique.length === 0) return result;

  try {
    const snaps = await withFirestoreRetry(() =>
      Promise.all(unique.map((id) => getDoc(doc(db, 'publicProfiles', id))))
    );
    for (const s of snaps) {
      if (s.exists()) {
        result[s.id] = s.data() as PublicProfile;
      }
    }
    return result;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'publicProfiles');
  }
}

export function subscribePublicProfile(
  uid: string,
  onData: (profile: PublicProfile | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'publicProfiles', uid),
    (snap) => {
      onData(snap.exists() ? (snap.data() as PublicProfile) : null);
    },
    (err) => handleFirestoreError(err, OperationType.GET, `publicProfiles/${uid}`)
  );
}
