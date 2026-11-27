import { useEffect, useState } from 'react';
import {
  Check,
  Loader2,
  MessageSquare,
  Phone,
  Search,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  FriendRequest,
  Friendship,
  PresencePayload,
  PublicProfile,
  SupportedLanguage,
} from '../types/domain';
import { searchGlobalUsers } from '../services/firestoreService';
import { Avatar } from './Avatar';

interface DiscoverPanelProps {
  mode: 'discover' | 'friends';
  lang: SupportedLanguage;
  currentUser: PublicProfile;
  friendships: Friendship[];
  friendRequests: FriendRequest[];
  profilesByUid: Record<string, PublicProfile>;
  presenceByUid: Record<string, PresencePayload>;
  onSendFriendRequest: (target: PublicProfile) => Promise<void>;
  onRespondFriendRequest: (
    req: FriendRequest,
    action: 'accepted' | 'rejected' | 'cancelled'
  ) => Promise<void>;
  onRemoveFriend: (pairId: string) => Promise<void>;
  onOpenChat: (friendUid: string) => void;
  onStartCall: (friend: PublicProfile, type: 'voice' | 'video') => void;
}

export function DiscoverPanel({
  mode,
  lang,
  currentUser,
  friendships,
  friendRequests,
  profilesByUid,
  presenceByUid,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriend,
  onOpenChat,
  onStartCall,
}: DiscoverPanelProps) {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (mode !== 'discover') return;
    const trimmed = queryText.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    setSearching(true);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const list = await searchGlobalUsers(trimmed, currentUser.uid);
        if (!cancelled) setResults(list);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [queryText, currentUser.uid, mode]);

  const friendUids = new Set(
    friendships.map((f) => (f.userA === currentUser.uid ? f.userB : f.userA))
  );

  const pendingIncoming = friendRequests.filter(
    (r) => r.status === 'pending' && r.toUid === currentUser.uid
  );
  const pendingOutgoing = friendRequests.filter(
    (r) => r.status === 'pending' && r.fromUid === currentUser.uid
  );

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyIds((prev) => ({ ...prev, [key]: true }));
    try {
      await fn();
    } finally {
      setBusyIds((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (mode === 'friends') {
    const friendsList = friendships
      .map((f) => {
        const friendUid = f.userA === currentUser.uid ? f.userB : f.userA;
        return {
          pairId: f.pairId,
          profile: profilesByUid[friendUid],
        };
      })
      .filter((item): item is { pairId: string; profile: PublicProfile } => Boolean(item.profile));

    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t(lang, 'tabFriends')}
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">{friendsList.length}</span>
          </div>

          {friendsList.length === 0 ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2 bg-white dark:bg-slate-900">
              <Users className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t(lang, 'noChatsTitle')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(lang, 'noChatsBody')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
              {friendsList.map(({ pairId, profile }) => {
                const liveStatus = presenceByUid[profile.uid]?.status || profile.status || 'offline';
                return (
                  <div
                    key={pairId}
                    className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={profile.displayName}
                        src={profile.avatarUrl}
                        status={liveStatus}
                        showStatus
                        size="md"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {profile.displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          <span dir="ltr">@{profile.username}</span>
                          <span className="mx-1.5" aria-hidden="true">·</span>
                          <span>
                            {liveStatus === 'online'
                              ? t(lang, 'statusOnline')
                              : liveStatus === 'busy'
                                ? t(lang, 'statusBusy')
                                : t(lang, 'statusOffline')}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenChat(profile.uid)}
                        aria-label={`${t(lang, 'messageAction')} ${profile.displayName}`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartCall(profile, 'voice')}
                        aria-label={`${t(lang, 'voiceCallAction')} ${profile.displayName}`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-teal-700 dark:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartCall(profile, 'video')}
                        aria-label={`${t(lang, 'videoCallAction')} ${profile.displayName}`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busyIds[pairId]}
                        onClick={() => runAction(pairId, () => onRemoveFriend(pairId))}
                        aria-label={`${t(lang, 'removeFriend')} ${profile.displayName}`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Global Discovery Search */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(lang, 'globalUsersTitle')}
          </h2>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={t(lang, 'globalSearchPlaceholder')}
              aria-label={t(lang, 'globalSearchPlaceholder')}
              className="w-full min-h-[44px] ps-10 pe-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {searching ? (
            <div className="py-6 flex items-center justify-center text-slate-500 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t(lang, 'usernameChecking')}</span>
            </div>
          ) : queryText.trim() && results.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              {t(lang, 'noUsersFound')}
            </p>
          ) : results.length > 0 ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
              {results.map((user) => {
                const isFriend = friendUids.has(user.uid);
                const outgoing = pendingOutgoing.find((r) => r.toUid === user.uid);
                const incoming = pendingIncoming.find((r) => r.fromUid === user.uid);

                return (
                  <div
                    key={user.uid}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {user.displayName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                          @{user.username}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isFriend ? (
                        <button
                          type="button"
                          onClick={() => onOpenChat(user.uid)}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {t(lang, 'messageAction')}
                        </button>
                      ) : incoming ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busyIds[incoming.id]}
                            onClick={() =>
                              runAction(incoming.id, () =>
                                onRespondFriendRequest(incoming, 'accepted')
                              )
                            }
                            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{t(lang, 'accept')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyIds[incoming.id]}
                            onClick={() =>
                              runAction(incoming.id, () =>
                                onRespondFriendRequest(incoming, 'rejected')
                              )
                            }
                            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300"
                          >
                            {t(lang, 'reject')}
                          </button>
                        </div>
                      ) : outgoing ? (
                        <button
                          type="button"
                          disabled={busyIds[outgoing.id]}
                          onClick={() =>
                            runAction(outgoing.id, () =>
                              onRespondFriendRequest(outgoing, 'cancelled')
                            )
                          }
                          className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          {t(lang, 'cancelRequest')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyIds[user.uid]}
                          onClick={() => runAction(user.uid, () => onSendFriendRequest(user))}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{t(lang, 'sendRequest')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(lang, 'searchPrompt')}
            </p>
          )}
        </div>

        {/* Incoming Friend Requests */}
        {pendingIncoming.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t(lang, 'incomingRequests')} ({pendingIncoming.length})
            </h3>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
              {pendingIncoming.map((req) => (
                <div key={req.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={req.fromDisplayName} src={req.fromAvatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {req.fromDisplayName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                        @{req.fromUsername}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyIds[req.id]}
                      onClick={() =>
                        runAction(req.id, () => onRespondFriendRequest(req, 'accepted'))
                      }
                      className="min-h-[40px] px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t(lang, 'accept')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyIds[req.id]}
                      onClick={() =>
                        runAction(req.id, () => onRespondFriendRequest(req, 'rejected'))
                      }
                      className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {t(lang, 'reject')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outgoing Friend Requests */}
        {pendingOutgoing.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t(lang, 'outgoingRequests')} ({pendingOutgoing.length})
            </h3>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
              {pendingOutgoing.map((req) => (
                <div key={req.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={req.toDisplayName} src={req.toAvatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {req.toDisplayName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                        @{req.toUsername}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyIds[req.id]}
                    onClick={() =>
                      runAction(req.id, () => onRespondFriendRequest(req, 'cancelled'))
                    }
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{t(lang, 'cancelRequest')}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
