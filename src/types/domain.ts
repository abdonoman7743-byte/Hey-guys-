export type PresenceStatus = 'online' | 'busy' | 'offline';
export type ManualStatus = 'available' | 'busy';
export type SupportedLanguage = 'en' | 'ar';
export type ThemeMode = 'light' | 'dark';
export type CallType = 'video' | 'voice';
export type CallRecordStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'rejected' | 'busy' | 'failed';
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface PublicProfile {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  displayNameLower: string;
  avatarUrl?: string;
  bio?: string;
  status: PresenceStatus;
  manualStatus: ManualStatus;
  lastSeen: any;
  createdAt: any;
  updatedAt: any;
}

export interface PrivateUser {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  preferredLanguage: SupportedLanguage;
  theme: ThemeMode;
  notificationsEnabled: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  participantUids: string[];
  fromUsername: string;
  fromDisplayName: string;
  fromAvatarUrl?: string;
  toUsername: string;
  toDisplayName: string;
  toAvatarUrl?: string;
  status: FriendRequestStatus;
  createdAt: any;
  updatedAt: any;
}

export interface Friendship {
  pairId: string;
  userA: string;
  userB: string;
  participantUids: string[];
  requestId: string;
  createdAt: any;
}

export interface Conversation {
  conversationId: string;
  participantUids: string[];
  lastMessageText: string;
  lastMessageSenderUid: string;
  lastMessageType: 'text' | 'call' | 'image' | 'system';
  lastMessageAt: any;
  unreadA?: number;
  unreadB?: number;
  createdAt: any;
  updatedAt: any;
}

export interface Message {
  id: string;
  conversationId: string;
  senderUid: string;
  participantUids: string[];
  type: 'text' | 'call_log' | 'image';
  text: string;
  mediaUrl?: string;
  replyToId?: string;
  replyToPreview?: string;
  status: 'sent' | 'delivered' | 'read';
  readAt?: any;
  createdAt: any;
}

export interface CallRecord {
  callId: string;
  callerUid: string;
  calleeUid: string;
  participantUids: string[];
  callerName: string;
  callerUsername: string;
  callerAvatarUrl?: string;
  calleeName: string;
  calleeUsername: string;
  calleeAvatarUrl?: string;
  type: CallType;
  status: CallRecordStatus;
  durationSeconds: number;
  startedAt: any;
  endedAt?: any;
  updatedAt: any;
}

export interface AppNotification {
  id: string;
  recipientUid: string;
  senderUid: string;
  senderName: string;
  senderUsername: string;
  type: 'missed_call' | 'friend_request' | 'friend_accepted' | 'new_message';
  title: string;
  body: string;
  read: boolean;
  refId: string;
  createdAt: any;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PresencePayload {
  uid: string;
  status: PresenceStatus;
  manualStatus: ManualStatus;
  lastSeen: number;
}
