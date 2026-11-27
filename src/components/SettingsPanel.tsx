import { useState, type FormEvent } from 'react';
import { Bell, Check, Globe, Loader2, LogOut, Moon, Sun } from 'lucide-react';
import { t } from '../i18n/translations';
import type {
  ManualStatus,
  PublicProfile,
  SupportedLanguage,
  ThemeMode,
} from '../types/domain';
import { Avatar } from './Avatar';

interface SettingsPanelProps {
  lang: SupportedLanguage;
  theme: ThemeMode;
  currentUser: PublicProfile;
  email: string;
  onChangeLanguage: (next: SupportedLanguage) => void;
  onChangeTheme: (next: ThemeMode) => void;
  onSaveProfile: (updates: {
    displayName: string;
    bio: string;
    manualStatus: ManualStatus;
  }) => Promise<void>;
  onEnablePush: () => Promise<'granted' | 'denied' | 'unsupported'>;
  onSignOut: () => Promise<void>;
}

export function SettingsPanel({
  lang,
  theme,
  currentUser,
  email,
  onChangeLanguage,
  onChangeTheme,
  onSaveProfile,
  onEnablePush,
  onSignOut,
}: SettingsPanelProps) {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [manualStatus, setManualStatus] = useState<ManualStatus>(
    currentUser.manualStatus || 'available'
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushState, setPushState] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
      ? 'granted'
      : 'idle'
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSaveProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        manualStatus,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    const res = await onEnablePush();
    setPushState(res);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {t(lang, 'settingsTitle')}
        </h2>

        {/* Account Overview */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar
              name={currentUser.displayName}
              src={currentUser.avatarUrl}
              status={manualStatus === 'busy' ? 'busy' : 'online'}
              showStatus
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 dark:text-white truncate">
                {currentUser.displayName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate" dir="ltr">
                @{currentUser.username} · {email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-medium inline-flex items-center gap-2 shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>{t(lang, 'signOut')}</span>
          </button>
        </div>

        {/* Profile Form */}
        <form
          onSubmit={handleSubmit}
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <div>
            <label
              htmlFor="set-displayname"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'displayNameLabel')}
            </label>
            <input
              id="set-displayname"
              type="text"
              required
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label
              htmlFor="set-bio"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'bioLabel')}
            </label>
            <input
              id="set-bio"
              type="text"
              maxLength={160}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div>
            <label
              htmlFor="set-presence"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'presenceLabel')}
            </label>
            <select
              id="set-presence"
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value as ManualStatus)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="available">{t(lang, 'manualAvailable')}</option>
              <option value="busy">{t(lang, 'manualBusy')}</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            {saved && (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <Check className="w-4 h-4" />
                {t(lang, 'savedSuccess')}
              </span>
            )}
            <button
              type="submit"
              disabled={saving || !displayName.trim()}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? t(lang, 'saving') : t(lang, 'saveProfile')}</span>
            </button>
          </div>
        </form>

        {/* Preferences: Language, Theme, Push Notifications */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
          <div className="pb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              <Globe className="w-4 h-4 text-slate-500" />
              <span>{t(lang, 'languageLabel')}</span>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => onChangeLanguage('en')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  lang === 'en'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => onChangeLanguage('ar')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  lang === 'ar'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                العربية
              </button>
            </div>
          </div>

          <div className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              {theme === 'light' ? (
                <Sun className="w-4 h-4 text-slate-500" />
              ) : (
                <Moon className="w-4 h-4 text-slate-500" />
              )}
              <span>{t(lang, 'themeLabel')}</span>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => onChangeTheme('light')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  theme === 'light'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'themeLight')}
              </button>
              <button
                type="button"
                onClick={() => onChangeTheme('dark')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'themeDark')}
              </button>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              <Bell className="w-4 h-4 text-slate-500" />
              <span>{t(lang, 'pushNotificationsLabel')}</span>
            </div>

            {pushState === 'granted' ? (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {t(lang, 'pushEnabled')}
              </span>
            ) : pushState === 'denied' || pushState === 'unsupported' ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {t(lang, 'pushUnsupported')}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleEnablePush}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t(lang, 'enablePushBtn')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
