# Nidaa — Production Architecture, Services & Deployment Guide

## 1. Live Architecture Summary
- **Backend & Signaling**: Node.js + Express + Socket.IO (`server.ts`, `server/signaling.ts`) serving both REST APIs (`/api/health`, `/api/rtc-config`, `/api/push/notify`) and real-time WebRTC signaling / presence over `/socket.io` on port `3000`.
- **Authentication**: Firebase Authentication (Google Sign-In) with server-side ID Token verification via `firebase-admin` (`verifyIdToken`).
- **Live Database (AI Studio Environment)**: Cloud Firestore (`firebase-blueprint.json`, hardened `firestore.rules`) storing private user accounts, PII-isolated public discovery profiles, unique `@username` reservations, friend requests, friendships, conversations, persistent messages, call history, notifications, and push device tokens.
- **PostgreSQL Migration Schema**: `migrations/001_initial_schema.sql` provides the complete 9-table PostgreSQL DDL (`users`, `profiles`, `friend_requests`, `friendships`, `conversations`, `messages`, `calls`, `notifications`, `device_tokens`) with indexes and constraints for external PostgreSQL / Railway environments where managed PostgreSQL is attached.
- **WebRTC Media**: Real `RTCPeerConnection` with SDP offer/answer & trickled ICE exchange, front/rear camera switching (`RTCRtpSender.replaceTrack`), microphone toggle, speaker routing (`setSinkId`), and automatic `restartIce()` on transient disconnects.
- **Bilingual UI**: Full English (LTR) and Arabic (RTL) localization with responsive desktop & mobile layouts.

## 2. External Services & Required Credentials

### A. STUN & TURN Infrastructure (Required for Cross-Network NAT Traversal)
Public STUN servers (`stun:stun.l.google.com:19302`) are enabled by default. For reliable two-device calling across symmetric NATs, cellular carrier CGNAT, or strict corporate firewalls, deploy **Coturn** or use a managed TURN provider (e.g. Cloudflare Calls TURN, Metered, Twilio) and configure:
- `STUN_URLS` (comma-separated STUN URLs)
- `TURN_URLS` (e.g. `turn:turn.yourdomain.com:3478,turns:turn.yourdomain.com:5349`)
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

### B. Firebase Cloud Messaging (FCM) & Apple Push Notification Service (APNs)
- **Web Push / FCM**: Set `VITE_FCM_VAPID_KEY` (from Firebase Console -> Cloud Messaging -> Web Push certificates) and `FCM_SERVICE_ACCOUNT_JSON` (server-side service account JSON) to send background Web/Android pushes via `/api/push/notify`.
- **Apple Push Notification service (APNs)**: Set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` (`.p8` key contents), and `APNS_PRODUCTION` (`true`/`false`) to dispatch HTTP/2 JWT push alerts to iOS devices.

### C. Railway Deployment
1. Connect your repository to Railway (`railway.toml` and `Procfile` are pre-configured).
2. Set `NODE_ENV=production`, `ALLOWED_ORIGINS=https://your-domain.up.railway.app`, and the STUN/TURN + FCM/APNs environment variables from `.env.example`.
3. Health check runs automatically at `GET /api/health`.
4. If migrating persistence from Firestore to Railway PostgreSQL, provision the Railway Postgres plugin (`DATABASE_URL`) and apply `migrations/001_initial_schema.sql`.

## 3. Verified Scope & Remaining Limitations
- **Verified**: TypeScript compilation, Firestore security rules ESLint audit + deployment, unit tests for username validation / call state machine / bilingual dictionary, and automated server tests for `/api/rtc-config` auth and two-client Socket.IO WebRTC SDP/ICE/presence relay.
- **Remaining Limitations**:
  1. **Cross-Network Physical Device Calls**: End-to-end audio/video media between two physical devices on separate cellular/Wi-Fi networks requires provisioning external `TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL` and testing in two real browsers with camera/microphone hardware (cannot be completed inside a single headless container without hardware media & external TURN credentials).
  2. **Background Mobile Push Delivery**: `server/pushService.ts` implements real FCM and APNs HTTP/2 dispatch, but requires your `FCM_SERVICE_ACCOUNT_JSON` and Apple `.p8` APNs credentials to deliver notifications when mobile apps are backgrounded.
  3. **Database Engine in AI Studio**: Because Cloud SQL PostgreSQL provisioning was unavailable for this project (`NO_VALID_PROJECT`), the live running app persists all data in Cloud Firestore with hardened security rules, while `migrations/001_initial_schema.sql` supplies the PostgreSQL schema for Railway/self-hosted deployment.
