import { useState } from 'react';
import {
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Video,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type { CallRecord, PublicProfile, SupportedLanguage } from '../types/domain';
import { formatCallDuration, formatMessageTime } from '../utils/chatUtils';
import { Avatar } from './Avatar';

interface CallsHistoryPanelProps {
  lang: SupportedLanguage;
  currentUid: string;
  calls: CallRecord[];
  profilesByUid: Record<string, PublicProfile>;
  onStartCall: (peer: PublicProfile, type: 'voice' | 'video') => void;
}

export function CallsHistoryPanel({
  lang,
  currentUid,
  calls,
  profilesByUid,
  onStartCall,
}: CallsHistoryPanelProps) {
  const [filter, setFilter] = useState<'all' | 'missed'>('all');

  const filteredCalls =
    filter === 'missed'
      ? calls.filter((c) => c.status === 'missed' && c.calleeUid === currentUid)
      : calls;

  const getStatusLabel = (call: CallRecord) => {
    switch (call.status) {
      case 'ended':
        return t(lang, 'callStatusEnded');
      case 'missed':
        return t(lang, 'callStatusMissed');
      case 'rejected':
        return t(lang, 'callStatusRejected');
      case 'busy':
        return t(lang, 'callStatusBusy');
      case 'failed':
        return t(lang, 'callStatusFailed');
      case 'active':
        return t(lang, 'callStatusActive');
      default:
        return t(lang, 'callStatusRinging');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t(lang, 'tabCalls')}
          </h2>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t(lang, 'callsAll')}
            </button>
            <button
              type="button"
              onClick={() => setFilter('missed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                filter === 'missed'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t(lang, 'callsMissed')}
            </button>
          </div>
        </div>

        {filteredCalls.length === 0 ? (
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2 bg-white dark:bg-slate-900">
            <Phone className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t(lang, 'noCallsTitle')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(lang, 'noCallsBody')}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
            {filteredCalls.map((call) => {
              const isOutgoing = call.callerUid === currentUid;
              const peerUid = isOutgoing ? call.calleeUid : call.callerUid;
              const peerName = isOutgoing ? call.calleeName : call.callerName;
              const peerUsername = isOutgoing ? call.calleeUsername : call.callerUsername;
              const peerAvatar = isOutgoing ? call.calleeAvatarUrl : call.callerAvatarUrl;
              const isMissed = call.status === 'missed' && !isOutgoing;
              const peerProfile = profilesByUid[peerUid];

              return (
                <div
                  key={call.callId}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={peerName} src={peerAvatar} size="md" />
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isMissed
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {peerName}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {isMissed ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        ) : isOutgoing ? (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        ) : (
                          <PhoneIncoming className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span>{getStatusLabel(call)}</span>
                        {call.durationSeconds > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatCallDuration(call.durationSeconds)}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{formatMessageTime(call.startedAt, lang)}</span>
                        <span className="hidden sm:inline" dir="ltr">
                          · @{peerUsername}
                        </span>
                      </div>
                    </div>
                  </div>

                  {peerProfile && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onStartCall(peerProfile, 'voice')}
                        aria-label={`${t(lang, 'voiceCallAction')} ${peerName}`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-teal-700 dark:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartCall(peerProfile, 'video')}
                        aria-label={`${t(lang, 'videoCallAction')} ${peerName}`}
                        className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
