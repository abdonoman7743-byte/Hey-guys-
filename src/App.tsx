import { API_BASE_URL } from './lib/apiBase';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { authErrorMessage, isSilentAuthError } from './utils/authUtils';
import { io, type Socket } from 'socket.io-client';
import {
  AlertTriangle,
  Bell,
  Compass,
  Loader2,
  MessageSquare,
  Phone,
  RotateCcw,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase';
import { t } from './i18n/translations';
import type {
  AppNotification,
  CallRecord,
  Conversation,
  FriendRequest,
  Friendship,
  ManualStatus,
  Message,
  PresencePayload,
  PrivateUser,
  PublicProfile,
  SupportedLanguage,
  ThemeMode,
} from './types/domain';
import {
  fetchProfilesByUids,
  getUserAccount,
  markMessagesAsRead,
  markNotificationRead,
  registerDeviceToken,
  removeFriendship,
  respondToFriendRequest,
  sendFriendRequest,
  sendMessage,
  subscribeCalls,
  subscribeConversations,
  subscribeFriendRequests,
  subscribeFriendships,
  subscribeMessages,
  subscribeNotifications,
  subscribePublicProfile,
  syncPresenceToFirestore,
  updateUserSettings,
} from './services/firestoreService';
import { getDeterministicPairId, formatMessageTime } from './utils/chatUtils';
import { useWebRTC } from './hooks/useWebRTC';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthView } from './components/AuthView';
import { Avatar } from './components/Avatar';
import { ChatWindow } from './components/ChatWindow';
import { CallOverlay } from './components/CallOverlay';
import { DiscoverPanel } from './components/DiscoverPanel';
import { CallsHistoryPanel } from './components/CallsHistoryPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { NotificationsPopover } from './components/NotificationsPopover';

type ActiveTab = 'chats' | 'calls' | 'discover' | 'friends' | 'settings';

function MainApp() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [lang, setLang] = useState<SupportedLanguage>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('nidaa_lang') : null;
    return saved === 'ar' ? 'ar' : 'en';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('nidaa_theme') : null;
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('chats');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [profilesByUid, setProfilesByUid] = useState<Record<string, PublicProfile>>({});
  const [presenceByUid, setPresenceByUid] = useState<Record<string, PresencePayload>>({});
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});

  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  // Sync HTML dir/lang/dark class
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('nidaa_lang', lang);
    } catch {
      // Ignore storage error
    }
  }, [lang]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('nidaa_theme', theme);
    } catch {
      // Ignore storage error
    }
  }, [theme]);

  const loadAccount = useCallback(async (uid: string) => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const { privateUser: priv, publicProfile: pub } = await getUserAccount(uid);
      setPrivateUser(priv);
      setPublicProfile(pub);
      if (priv?.preferredLanguage) setLang(priv.preferredLanguage);
      if (priv?.theme) setTheme(priv.theme);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Unable to load account.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setProfileLoading(true);
        setAuthReady(true);
        await loadAccount(user.uid);
      } else {
        setAuthReady(true);
        setPrivateUser(null);
        setPublicProfile(null);
        setProfileError(null);
      }
    });
    return () => unsub();
  }, [loadAccount]);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  // Connect Socket.IO once profile is registered
  useEffect(() => {
    if (!firebaseUser || !publicProfile) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setSocketConnected(false);
      return;
    }

    let cancelled = false;
    let instance: Socket | null = null;

    const connect = async () => {
      const token = await firebaseUser.getIdToken();
      if (cancelled) return;

      instance = io(API_BASE_URL || undefined, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
      });

      socketRef.current = instance;
      setSocket(instance);

      instance.on('connect', () => {
        setSocketConnected(true);
        const manual = publicProfile.manualStatus || 'available';
        instance?.emit('presence:set', { manualStatus: manual });
        void syncPresenceToFirestore(
          firebaseUser.uid,
          manual === 'busy' ? 'busy' : 'online'
        );
      });

      instance.on('disconnect', () => {
        setSocketConnected(false);
      });

      instance.on('presence:changed', (payload: PresencePayload) => {
        setPresenceByUid((prev) => ({
          ...prev,
          [payload.uid]: payload,
        }));
      });

      instance.on('typing:start', (payload: { fromUid: string; conversationId: string }) => {
        setTypingMap((prev) => ({ ...prev, [payload.conversationId]: true }));
      });

      instance.on('typing:stop', (payload: { fromUid: string; conversationId: string }) => {
        setTypingMap((prev) => ({ ...prev, [payload.conversationId]: false }));
      });
    };

    void connect();

    const handleBeforeUnload = () => {
      void syncPresenceToFirestore(firebaseUser.uid, 'offline');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (instance) {
        instance.disconnect();
      }
      socketRef.current = null;
      setSocket(null);
      setSocketConnected(false);
    };
  }, [firebaseUser, publicProfile?.uid]);

  // Firestore real-time subscriptions when authenticated & registered
  useEffect(() => {
    if (!firebaseUser || !publicProfile) return;
    const uid = firebaseUser.uid;

    const unsubs = [
      subscribePublicProfile(uid, (p) => {
        if (p) setPublicProfile(p);
      }),
      subscribeFriendRequests(uid, setFriendRequests),
      subscribeFriendships(uid, setFriendships),
      subscribeConversations(uid, setConversations),
      subscribeCalls(uid, setCalls),
      subscribeNotifications(uid, setNotifications),
    ];

    return () => unsubs.forEach((u) => u());
  }, [firebaseUser, publicProfile?.uid]);

  // Fetch public profiles for all friends, conversation peers, and call peers
  useEffect(() => {
    if (!publicProfile) return;
    const uids = new Set<string>();
    friendships.forEach((f) => {
      uids.add(f.userA === publicProfile.uid ? f.userB : f.userA);
    });
    conversations.forEach((c) => {
      c.participantUids.forEach((id) => {
        if (id !== publicProfile.uid) uids.add(id);
      });
    });
    calls.forEach((c) => {
      c.participantUids.forEach((id) => {
        if (id !== publicProfile.uid) uids.add(id);
      });
    });

    const missing = Array.from(uids).filter((id) => !profilesByUid[id]);
    if (missing.length > 0) {
      void fetchProfilesByUids(missing).then((fetched) => {
        setProfilesByUid((prev) => ({ ...prev, ...fetched }));
      });
    }

    if (socket && socketConnected && uids.size > 0) {
      socket.emit(
        'presence:query',
        Array.from(uids),
        (result: Record<string, PresencePayload>) => {
          setPresenceByUid((prev) => ({ ...prev, ...result }));
        }
      );
    }
  }, [
    publicProfile,
    friendships,
    conversations,
    calls,
    profilesByUid,
    socket,
    socketConnected,
  ]);

  // Subscribe to messages for selected conversation & mark incoming as read
  useEffect(() => {
    if (!selectedConversationId || !publicProfile) {
      setMessages([]);
      return;
    }
    const unsub = subscribeMessages(selectedConversationId, (msgs) => {
      setMessages(msgs);
      void markMessagesAsRead(selectedConversationId, msgs, publicProfile.uid).catch(() => {});
    });
    return () => unsub();
  }, [selectedConversationId, publicProfile?.uid]);

  const webrtc = useWebRTC({
    socket,
    currentUser: publicProfile,
    getIdToken,
    profilesByUid,
  });

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      if (!isSilentAuthError(err)) setAuthError(authErrorMessage(err, lang));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSignIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const handleEmailSignUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email.trim(), password);
  };

  const handlePasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const handleSignOut = async () => {
    if (firebaseUser) {
      await syncPresenceToFirestore(firebaseUser.uid, 'offline');
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    await signOut(auth);
  };

  const handleOpenChatWithFriend = (friendUid: string) => {
    if (!publicProfile) return;
    const convId = getDeterministicPairId(publicProfile.uid, friendUid);
    setSelectedConversationId(convId);
    setActiveTab('chats');
  };

  const handleSendFriendRequest = async (target: PublicProfile) => {
    if (!publicProfile) return;
    await sendFriendRequest(publicProfile, target);
    socket?.emit('friend:event', { toUid: target.uid, kind: 'request' });
  };

  const handleRespondFriendRequest = async (
    req: FriendRequest,
    action: 'accepted' | 'rejected' | 'cancelled'
  ) => {
    if (!publicProfile) return;
    await respondToFriendRequest(req, action, publicProfile);
    if (action === 'accepted') {
      socket?.emit('friend:event', { toUid: req.fromUid, kind: 'accepted' });
    }
  };

  const handleEnablePush = async (): Promise<'granted' | 'denied' | 'unsupported'> => {
    if (typeof Notification === 'undefined' || !firebaseUser) return 'unsupported';
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    try {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      }
      const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
      if (vapidKey) {
        const { getMessaging, getToken } = await import('firebase/messaging');
        const { app } = await import('./lib/firebase');
        const messaging = getMessaging(app);
        const token = await getToken(messaging, { vapidKey });
        if (token) {
          await registerDeviceToken(firebaseUser.uid, token, 'web', 'fcm');
        }
      } else {
        await registerDeviceToken(
          firebaseUser.uid,
          `web_browser_${firebaseUser.uid}_${Date.now()}`,
          'web',
          'webpush'
        );
      }
      await updateUserSettings(firebaseUser.uid, { notificationsEnabled: true });
    } catch {
      // Browser notification permission still granted even if FCM VAPID key isn't configured
    }
    return 'granted';
  };

  // Loading Splash
  if (!authReady || (firebaseUser && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-7 h-7 animate-spin text-teal-700" />
      </div>
    );
  }

  // Connection / Profile Fetch Failure -> Retry card instead of falsely prompting registration
  if (firebaseUser && profileError && !publicProfile) {
    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6"
      >
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t(lang, 'connectionErrorTitle')}
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t(lang, 'connectionErrorBody')}
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void loadAccount(firebaseUser.uid)}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t(lang, 'retry')}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {t(lang, 'signOut')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unauthenticated or Unregistered -> AuthView
  if (!firebaseUser || !publicProfile) {
    return (
      <AuthView
        firebaseUser={firebaseUser}
        authLoading={authLoading}
        authError={authError}
        onEmailSignIn={handleEmailSignIn}
        onEmailSignUp={handleEmailSignUp}
        onPasswordReset={handlePasswordReset}
        lang={lang}
        theme={theme}
        onToggleLanguage={() => setLang((l) => (l === 'en' ? 'ar' : 'en'))}
        onToggleTheme={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        onProfileCreated={() => {
          if (firebaseUser) void loadAccount(firebaseUser.uid);
        }}
      />
    );
  }

  const activeConversation =
    conversations.find((c) => c.conversationId === selectedConversationId) || null;
  const activePeerUid = activeConversation
    ? activeConversation.participantUids.find((id) => id !== publicProfile.uid) || null
    : null;
  const activePeer = activePeerUid ? profilesByUid[activePeerUid] || null : null;

  const pendingIncomingCount = friendRequests.filter(
    (r) => r.status === 'pending' && r.toUid === publicProfile.uid
  ).length;
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;
  const missedCallsCount = calls.filter(
    (c) => c.status === 'missed' && c.calleeUid === publicProfile.uid
  ).length;

  const filteredConversations = conversations.filter((conv) => {
    const peerUid = conv.participantUids.find((id) => id !== publicProfile.uid);
    const peer = peerUid ? profilesByUid[peerUid] : undefined;
    if (!chatFilter.trim()) return true;
    const q = chatFilter.trim().toLowerCase();
    return (
      peer?.displayName.toLowerCase().includes(q) ||
      peer?.username.toLowerCase().includes(q) ||
      conv.lastMessageText.toLowerCase().includes(q)
    );
  });

  const navItems: { id: ActiveTab; label: string; icon: typeof MessageSquare; badge?: number }[] = [
    { id: 'chats', label: t(lang, 'tabChats'), icon: MessageSquare },
    {
      id: 'calls',
      label: t(lang, 'tabCalls'),
      icon: Phone,
      badge: missedCallsCount > 0 ? missedCallsCount : undefined,
    },
    {
      id: 'discover',
      label: t(lang, 'tabDiscover'),
      icon: Compass,
      badge: pendingIncomingCount > 0 ? pendingIncomingCount : undefined,
    },
    { id: 'friends', label: t(lang, 'tabFriends'), icon: Users },
    { id: 'settings', label: t(lang, 'tabSettings'), icon: Settings },
  ];

  const showMobileDetail = activeTab === 'chats' && Boolean(selectedConversationId);

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="h-screen w-full flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden"
    >
      {/* Desktop Navigation Rail */}
      <aside className="hidden md:flex w-20 flex-col items-center justify-between py-5 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center font-bold text-sm">
            {t(lang, 'appName').slice(0, 1)}
          </div>

          <nav className="flex flex-col items-center gap-2" aria-label="Primary Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-label={item.label}
                  title={item.label}
                  className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                    active
                      ? 'bg-teal-700/10 text-teal-700 dark:text-teal-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.badge && (
                    <span className="absolute top-1.5 end-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-3">
          <span
            title={socketConnected ? t(lang, 'socketConnected') : t(lang, 'socketReconnecting')}
            className={`w-2.5 h-2.5 rounded-full ${
              socketConnected ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            aria-label={t(lang, 'tabSettings')}
            className="cursor-pointer"
          >
            <Avatar
              name={publicProfile.displayName}
              src={publicProfile.avatarUrl}
              status={
                webrtc.callState.phase !== 'idle' || publicProfile.manualStatus === 'busy'
                  ? 'busy'
                  : 'online'
              }
              showStatus
              size="sm"
            />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        {/* Top Mobile/Context Header */}
        <header
          className={`${
            showMobileDetail ? 'hidden md:flex' : 'flex'
          } h-14 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 items-center justify-between gap-4 shrink-0`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-base font-bold tracking-tight whitespace-nowrap">
              {t(lang, 'appName')}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate hidden sm:inline" dir="ltr">
              @{publicProfile.username}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label={t(lang, 'notificationsTitle')}
              className="relative min-h-[40px] min-w-[40px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            <NotificationsPopover
              lang={lang}
              notifications={notifications}
              open={notifOpen}
              onClose={() => setNotifOpen(false)}
              onMarkRead={(id) => void markNotificationRead(id)}
              onMarkAllRead={() => {
                notifications
                  .filter((n) => !n.read)
                  .forEach((n) => void markNotificationRead(n.id));
              }}
            />
          </div>
        </header>

        {/* Active Workspace Pane */}
        <main className="flex-1 flex min-h-0 overflow-hidden pb-16 md:pb-0">
          {activeTab === 'chats' && (
            <>
              {/* Conversations List Pane */}
              <div
                className={`${
                  showMobileDetail ? 'hidden md:flex' : 'flex'
                } w-full md:w-80 lg:w-96 flex-col border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0`}
              >
                <div className="p-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                    <input
                      type="search"
                      value={chatFilter}
                      onChange={(e) => setChatFilter(e.target.value)}
                      placeholder={t(lang, 'searchPlaceholder')}
                      aria-label={t(lang, 'searchPlaceholder')}
                      className="w-full min-h-[40px] ps-9 pe-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <MessageSquare className="w-8 h-8 mx-auto text-slate-400" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {t(lang, 'noChatsTitle')}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t(lang, 'noChatsBody')}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('discover')}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Compass className="w-4 h-4" />
                        <span>{t(lang, 'goToDiscover')}</span>
                      </button>
                    </div>
                  ) : (
                    filteredConversations.map((conv) => {
                      const peerUid = conv.participantUids.find((id) => id !== publicProfile.uid);
                      const peer = peerUid ? profilesByUid[peerUid] : undefined;
                      if (!peer) return null;
                      const liveStatus =
                        presenceByUid[peer.uid]?.status || peer.status || 'offline';
                      const isSelected = conv.conversationId === selectedConversationId;
                      const isTyping = Boolean(typingMap[conv.conversationId]);

                      return (
                        <button
                          key={conv.conversationId}
                          type="button"
                          onClick={() => setSelectedConversationId(conv.conversationId)}
                          className={`w-full text-start p-3.5 flex items-center gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-teal-700/10 dark:bg-teal-900/25'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          <Avatar
                            name={peer.displayName}
                            src={peer.avatarUrl}
                            status={liveStatus}
                            showStatus
                            size="md"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {peer.displayName}
                              </p>
                              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                {formatMessageTime(conv.lastMessageAt, lang)}
                              </span>
                            </div>
                            <p
                              className={`text-xs truncate mt-0.5 ${
                                isTyping
                                  ? 'text-teal-700 dark:text-teal-400 font-medium'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {isTyping
                                ? t(lang, 'typingNow')
                                : conv.lastMessageText || `@${peer.username}`}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Active Conversation Window */}
              <ChatWindow
                lang={lang}
                currentUser={publicProfile}
                peer={activePeer}
                peerPresence={activePeer ? presenceByUid[activePeer.uid] : undefined}
                conversation={activeConversation}
                messages={messages}
                isPeerTyping={
                  activeConversation ? Boolean(typingMap[activeConversation.conversationId]) : false
                }
                onBackMobile={() => setSelectedConversationId(null)}
                onSendMessage={async (text, replyTo) => {
                  if (!activeConversation) return;
                  await sendMessage({
                    conversationId: activeConversation.conversationId,
                    participantUids: activeConversation.participantUids,
                    senderUid: publicProfile.uid,
                    text,
                    replyTo,
                  });
                  if (activePeer) {
                    socket?.emit('message:notify', {
                      toUid: activePeer.uid,
                      conversationId: activeConversation.conversationId,
                      preview: text,
                      senderName: publicProfile.displayName,
                    });
                  }
                }}
                onTypingChange={(typing) => {
                  if (!activePeer || !activeConversation) return;
                  socket?.emit(typing ? 'typing:start' : 'typing:stop', {
                    toUid: activePeer.uid,
                    conversationId: activeConversation.conversationId,
                  });
                }}
                onStartVoiceCall={(peer) => void webrtc.startCall(peer, 'voice')}
                onStartVideoCall={(peer) => void webrtc.startCall(peer, 'video')}
              />
            </>
          )}

          {activeTab === 'calls' && (
            <CallsHistoryPanel
              lang={lang}
              currentUid={publicProfile.uid}
              calls={calls}
              profilesByUid={profilesByUid}
              onStartCall={(peer, type) => void webrtc.startCall(peer, type)}
            />
          )}

          {(activeTab === 'discover' || activeTab === 'friends') && (
            <DiscoverPanel
              mode={activeTab}
              lang={lang}
              currentUser={publicProfile}
              friendships={friendships}
              friendRequests={friendRequests}
              profilesByUid={profilesByUid}
              presenceByUid={presenceByUid}
              onSendFriendRequest={handleSendFriendRequest}
              onRespondFriendRequest={handleRespondFriendRequest}
              onRemoveFriend={removeFriendship}
              onOpenChat={handleOpenChatWithFriend}
              onStartCall={(peer, type) => void webrtc.startCall(peer, type)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPanel
              lang={lang}
              theme={theme}
              currentUser={publicProfile}
              email={privateUser?.email || firebaseUser.email || ''}
              onChangeLanguage={(next) => {
                setLang(next);
                void updateUserSettings(publicProfile.uid, { preferredLanguage: next });
              }}
              onChangeTheme={(next) => {
                setTheme(next);
                void updateUserSettings(publicProfile.uid, { theme: next });
              }}
              onSaveProfile={async (updates) => {
                await updateUserSettings(publicProfile.uid, updates);
                socket?.emit('presence:set', { manualStatus: updates.manualStatus });
              }}
              onEnablePush={handleEnablePush}
              onSignOut={handleSignOut}
            />
          )}
        </main>

        {/* Mobile Bottom Tab Navigation (<= 15% height, >= 44px touch targets) */}
        <nav
          aria-label="Mobile Navigation"
          className={`${
            showMobileDetail ? 'hidden' : 'grid'
          } md:hidden fixed bottom-0 inset-x-0 z-20 h-16 grid-cols-5 items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  active
                    ? 'text-teal-700 dark:text-teal-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="truncate max-w-[60px]">{item.label}</span>
                {item.badge && (
                  <span className="absolute top-1 end-3 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Real-Time Voice & Video Call Overlay */}
      <CallOverlay
        lang={lang}
        callState={webrtc.callState}
        localStream={webrtc.localStream}
        remoteStream={webrtc.remoteStream}
        iceConnectionState={webrtc.iceConnectionState}
        mediaError={webrtc.mediaError}
        elapsedSeconds={webrtc.elapsedSeconds}
        audioOutputs={webrtc.audioOutputs}
        selectedAudioOutputId={webrtc.selectedAudioOutputId}
        remoteAudioLevel={webrtc.remoteAudioLevel}
        onSelectAudioOutput={webrtc.setSelectedAudioOutputId}
        onAccept={() => void webrtc.acceptIncomingCall()}
        onReject={webrtc.rejectIncomingCall}
        onHangup={webrtc.hangupCall}
        onToggleMute={webrtc.toggleMute}
        onToggleCamera={webrtc.toggleCamera}
        onToggleSpeaker={webrtc.toggleSpeaker}
        onSwitchCamera={() => void webrtc.switchCamera()}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
