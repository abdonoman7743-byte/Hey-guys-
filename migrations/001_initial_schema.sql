-- PostgreSQL Schema Migration (001_initial_schema.sql)
-- For self-hosted / Railway PostgreSQL deployment alongside migrations.
-- Note: Live AI Studio preview runs on Cloud Firestore + Firebase Auth.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'ar')),
  theme VARCHAR(8) NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(24) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  display_name VARCHAR(60) NOT NULL,
  avatar_url VARCHAR(500),
  bio VARCHAR(160) DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'busy', 'offline')),
  manual_status VARCHAR(16) NOT NULL DEFAULT 'available' CHECK (manual_status IN ('available', 'busy')),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_lower ON profiles (LOWER(display_name));

CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_user_id <> to_user_id),
  UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_to_status ON friend_requests (to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from_status ON friend_requests (from_user_id, status);

CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES friend_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_a ON friendships (user_a);
CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships (user_b);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_text TEXT DEFAULT '',
  last_message_sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type VARCHAR(16) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'call_log', 'image')),
  body TEXT NOT NULL,
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_type VARCHAR(16) NOT NULL CHECK (call_type IN ('video', 'voice')),
  status VARCHAR(16) NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'rejected', 'busy', 'failed')),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (caller_id <> callee_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls (caller_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls (callee_id, started_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notification_type VARCHAR(32) NOT NULL CHECK (notification_type IN ('missed_call', 'friend_request', 'friend_accepted', 'new_message')),
  title VARCHAR(120) NOT NULL,
  body VARCHAR(300) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  ref_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications (recipient_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(512) NOT NULL UNIQUE,
  platform VARCHAR(16) NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  provider VARCHAR(16) NOT NULL CHECK (provider IN ('fcm', 'apns', 'webpush')),
  user_agent VARCHAR(200) DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id);
