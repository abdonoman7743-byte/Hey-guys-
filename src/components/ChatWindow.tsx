import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  Phone,
  Reply,
  Send,
  Video,
  X,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  Conversation,
  Message,
  PresencePayload,
  PublicProfile,
  SupportedLanguage,
} from '../types/domain';
import { Avatar } from './Avatar';
import { formatLastSeen, formatMessageTime } from '../utils/chatUtils';

interface ChatWindowProps {
  lang: SupportedLanguage;
  currentUser: PublicProfile;
  peer: PublicProfile | null;
  peerPresence?: PresencePayload;
  conversation: Conversation | null;
  messages: Message[];
  isPeerTyping: boolean;
  onBackMobile: () => void;
  onSendMessage: (text: string, replyTo?: { id: string; preview: string } | null) => Promise<void>;
  onTypingChange: (typing: boolean) => void;
  onStartVoiceCall: (peer: PublicProfile) => void;
  onStartVideoCall: (peer: PublicProfile) => void;
}

export function ChatWindow({
  lang,
  currentUser,
  peer,
  peerPresence,
  conversation,
  messages,
  isPeerTyping,
  onBackMobile,
  onSendMessage,
  onTypingChange,
  onStartVoiceCall,
  onStartVideoCall,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; preview: string } | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isPeerTyping]);

  if (!peer || !conversation) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center p-10 text-center bg-slate-50/70 dark:bg-slate-950/60">
        <div className="max-w-sm space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-700/10 text-teal-700 dark:text-teal-400 flex items-center justify-center">
            <Video className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t(lang, 'selectChatPrompt')}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'selectChatSubtitle')}
          </p>
        </div>
      </div>
    );
  }

  const effectiveStatus = peerPresence?.status || peer.status || 'offline';
  const statusText =
    effectiveStatus === 'online'
      ? t(lang, 'statusOnline')
      : effectiveStatus === 'busy'
        ? t(lang, 'statusBusy')
        : formatLastSeen(peerPresence?.lastSeen || peer.lastSeen, lang);

  const handleInputChange = (val: string) => {
    setDraft(val);
    onTypingChange(true);
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      onTypingChange(false);
    }, 1800);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setDraft('');
    const activeReply = replyTo;
    setReplyTo(null);
    onTypingChange(false);
    try {
      await onSendMessage(trimmed, activeReply);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950 min-w-0">
      {/* Chat Header */}
      <header className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label={t(lang, 'back')}
            className="md:hidden min-h-[44px] min-w-[44px] -ms-2 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {lang === 'ar' ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>

          <Avatar
            name={peer.displayName}
            src={peer.avatarUrl}
            status={effectiveStatus}
            showStatus
            size="md"
          />

          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {peer.displayName}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span dir="ltr">@{peer.username}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  isPeerTyping
                    ? 'text-teal-700 dark:text-teal-400 font-medium'
                    : effectiveStatus === 'online'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : effectiveStatus === 'busy'
                        ? 'text-amber-600 dark:text-amber-400'
                        : ''
                }
              >
                {isPeerTyping ? t(lang, 'typingNow') : statusText}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onStartVoiceCall(peer)}
            aria-label={`${t(lang, 'voiceCallAction')} ${peer.displayName}`}
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer"
          >
            <Phone className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span className="hidden sm:inline whitespace-nowrap">{t(lang, 'voiceCallAction')}</span>
          </button>
          <button
            type="button"
            onClick={() => onStartVideoCall(peer)}
            aria-label={`${t(lang, 'videoCallAction')} ${peer.displayName}`}
            className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white inline-flex items-center justify-center gap-2 text-xs font-medium transition-colors cursor-pointer"
          >
            <Video className="w-4 h-4" />
            <span className="hidden sm:inline whitespace-nowrap">{t(lang, 'videoCallAction')}</span>
          </button>
        </div>
      </header>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-slate-50/60 dark:bg-slate-950">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center py-12">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'typeMessagePlaceholder')}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderUid === currentUser.uid;
            return (
              <div
                key={msg.id}
                className={`group flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                {!isMine && (
                  <button
                    type="button"
                    onClick={() => setReplyTo({ id: msg.id, preview: msg.text })}
                    aria-label={t(lang, 'replyingTo')}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-opacity"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                )}

                <div
                  className={`max-w-[78%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMine
                      ? 'bg-teal-700 text-white rounded-ee-sm'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-es-sm'
                  }`}
                >
                  {msg.replyToPreview && (
                    <div
                      className={`mb-1.5 px-2.5 py-1 rounded-lg text-xs truncate ${
                        isMine
                          ? 'bg-teal-800/70 text-teal-100'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {msg.replyToPreview}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[11px] tabular-nums ${
                      isMine ? 'text-teal-100/80' : 'text-slate-400'
                    }`}
                  >
                    <span>{formatMessageTime(msg.createdAt, lang)}</span>
                    {isMine &&
                      (msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-teal-200" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      ))}
                  </div>
                </div>

                {isMine && (
                  <button
                    type="button"
                    onClick={() => setReplyTo({ id: msg.id, preview: msg.text })}
                    aria-label={t(lang, 'replyingTo')}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-opacity"
                  >
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply Banner */}
      {replyTo && (
        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
            <span className="font-semibold me-1.5">{t(lang, 'replyingTo')}:</span>
            <span>{replyTo.preview}</span>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label={t(lang, 'cancelReply')}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={t(lang, 'typeMessagePlaceholder')}
          aria-label={t(lang, 'typeMessagePlaceholder')}
          className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label={t(lang, 'sendMessage')}
          className="min-h-[44px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-45 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">{t(lang, 'sendMessage')}</span>
        </button>
      </form>
    </section>
  );
}
