# Security Specification: Firestore Rules Invariants & Dirty Dozen

## 1. Data Invariants
1. **PII Isolation**: Private account info (`email`, `preferredLanguage`, `deviceTokens`) resides exclusively in `/users/{uid}` and `/users/{uid}/deviceTokens/{tokenId}` and is readable/writable only by `request.auth.uid == uid`. Public discovery uses `/publicProfiles/{uid}` which contains zero PII.
2. **Unique Username Integrity**: Claiming a username requires writing `/usernames/{username}` where `uid == request.auth.uid` and the document does not already exist.
3. **Friend Request State Integrity**: Only `fromUid` can create a `'pending'` request to a valid existing `toUid != fromUid`. Only `toUid` can transition `'pending' -> 'accepted' | 'rejected'`; only `fromUid` can transition `'pending' -> 'cancelled'`. Terminal states (`accepted`, `rejected`, `cancelled`) are locked.
4. **Friendship & Conversation Atomicity**: Creating `/friendships/{pairId}` requires `getAfter(/databases/$(database)/documents/friendRequests/$(requestId)).data.status == 'accepted'` in the same batch. Creating `/conversations/{conversationId}` requires `existsAfter(/databases/$(database)/documents/friendships/$(conversationId))`.
5. **Conversation & Message Membership**: Messages can only be created by a participant of the parent conversation (`get(.../conversations/{id})`), with `senderUid == request.auth.uid`. List queries on messages check `request.auth.uid in resource.data.participantUids` without `get()` lookups.
6. **Call History Terminal Locking**: Calls start as `'ringing'` with `callerUid == request.auth.uid` and can only be updated by participants while in `['ringing', 'active']`. Once `'ended' | 'missed' | 'rejected' | 'busy' | 'failed'`, the call record is immutable.
7. **Strict Temporal & Schema Bounds**: Every `create` and `update` enforces `request.time` on `createdAt`/`updatedAt` and validates key allowlists (`hasAll`/`hasOnly` + `affectedKeys().hasOnly()`) and string size limits.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: `get(/publicProfiles/userA)` with `auth == null` -> DENIED.
2. **PII Leakage**: `get(/users/userB)` signed in as `userA` -> DENIED.
3. **Username Hijack**: `create(/usernames/alice)` as `userB` with `uid: "userA"` or overwriting existing `alice` -> DENIED.
4. **Shadow Field Injection**: `create(/publicProfiles/userA)` with extra key `isAdmin: true` -> DENIED.
5. **ID Poisoning**: `create(/publicProfiles/../../evil)` or 1.5KB ID -> DENIED.
6. **Self Friend Request**: `create(/friendRequests/a_a)` with `fromUid == toUid` -> DENIED.
7. **Unauthorized Accept**: `update(/friendRequests/a_b)` setting `status: "accepted"` while authenticated as `userA` (the sender) -> DENIED.
8. **Terminal State Re-open**: `update(/friendRequests/a_b)` changing `status: "rejected"` back to `"pending"` -> DENIED.
9. **Orphan Friendship Creation**: `create(/friendships/userA_userB)` without an accepted `friendRequests` doc in the batch -> DENIED.
10. **Message Sender Spoofing**: `create(/conversations/userA_userB/messages/m1)` as `userA` with `senderUid: "userB"` -> DENIED.
11. **Unscoped List Query**: `list(/calls)` without `where('participantUids', 'array-contains', uid)` -> DENIED.
12. **Timestamp Forgery**: `create(/conversations/userA_userB/messages/m1)` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time` -> DENIED.
