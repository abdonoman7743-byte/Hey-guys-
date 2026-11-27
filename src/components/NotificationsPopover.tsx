import { Bell, CheckCheck, PhoneMissed, UserCheck, UserPlus } from 'lucide-react';
import { t } from '../i18n/translations';
import type { AppNotification, SupportedLanguage } from '../types/domain';
import { formatMessageTime } from '../utils/chatUtils';

interface NotificationsPopoverProps {
  lang: SupportedLanguage;
  notifications: AppNotification[];
  open: boolean;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationsPopover({
  lang,
  notifications,
  open,
  onClose,
  onMarkRead,
  onMarkAllRead,
}: NotificationsPopoverProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />
      <div
        role="region"
        aria-label={t(lang, 'notificationsTitle')}
        className="absolute top-14 end-3 z-40 w-80 sm:w-96 max-h-[70vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(lang, 'notificationsTitle')}
          </h3>
          {notifications.some((n) => !n.read) && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{t(lang, 'markAllRead')}</span>
            </button>
          )}
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <Bell className="w-6 h-6 mx-auto text-slate-400" />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(lang, 'noNotifications')}
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onMarkRead(n.id)}
                className={`w-full text-start p-3.5 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                  !n.read ? 'bg-teal-50/50 dark:bg-teal-950/20' : ''
                }`}
              >
                <span className="mt-0.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  {n.type === 'missed_call' ? (
                    <PhoneMissed className="w-4 h-4 text-rose-500" />
                  ) : n.type === 'friend_request' ? (
                    <UserPlus className="w-4 h-4 text-teal-600" />
                  ) : (
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {n.title}
                    </p>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {formatMessageTime(n.createdAt, lang)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {n.body}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
