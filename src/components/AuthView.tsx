import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Globe,
  Loader2,
  MessageSquare,
  Moon,
  PhoneCall,
  Sun,
  UserCheck,
  Video,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type { SupportedLanguage, ThemeMode } from '../types/domain';
import { checkUsernameAvailability, registerUserProfile } from '../services/firestoreService';
import { normalizeUsername, validateUsername } from '../utils/chatUtils';

interface AuthViewProps {
  firebaseUser: User | null;
  authLoading: boolean;
  authError: string | null;
  lang: SupportedLanguage;
  theme: ThemeMode;
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onProfileCreated: () => void;
}

export function AuthView({
  firebaseUser,
  authLoading,
  authError,
  lang,
  theme,
  onToggleLanguage,
  onToggleTheme,
  onGoogleSignIn,
  onSignOut,
  onProfileCreated,
}: AuthViewProps) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(firebaseUser?.displayName || '');
  const [bio, setBio] = useState('');
  const [availability, setAvailability] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [validationReason, setValidationReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    if (firebaseUser?.displayName && !displayName) {
      setDisplayName(firebaseUser.displayName);
    }
  }, [firebaseUser, displayName]);

  useEffect(() => {
    if (!firebaseUser) return;
    const raw = username.trim();
    if (!raw) {
      setAvailability('idle');
      setValidationReason(null);
      return;
    }

    const check = validateUsername(raw);
    if (!check.valid) {
      setAvailability('invalid');
      if (check.reason === 'too_short') setValidationReason(t(lang, 'usernameInvalidTooShort'));
      else if (check.reason === 'too_long') setValidationReason(t(lang, 'usernameInvalidTooLong'));
      else setValidationReason(t(lang, 'usernameInvalidChars'));
      return;
    }

    setValidationReason(null);
    setAvailability('checking');
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const isAvail = await checkUsernameAvailability(check.normalized);
        if (!cancelled) {
          setAvailability(isAvail ? 'available' : 'taken');
        }
      } catch {
        if (!cancelled) setAvailability('idle');
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username, firebaseUser, lang]);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const check = validateUsername(username);
    if (!check.valid || availability === 'taken') return;
    if (!displayName.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const stillAvailable = await checkUsernameAvailability(check.normalized);
      if (!stillAvailable) {
        setAvailability('taken');
        setSubmitting(false);
        return;
      }

      await registerUserProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        username: check.normalized,
        displayName: displayName.trim(),
        bio,
        avatarUrl: firebaseUser.photoURL || undefined,
        preferredLanguage: lang,
        theme,
      });
      onProfileCreated();
    } catch (err: any) {
      setSubmitError(err?.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col"
    >
      {/* Top 3-zone header */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <span className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center">
              <PhoneCall className="w-4 h-4" />
            </span>
            <span className="text-lg font-bold tracking-tight">{t(lang, 'appName')}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleLanguage}
              aria-label={lang === 'en' ? 'Switch to Arabic' : 'Switch to English'}
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Globe className="w-4 h-4" />
              <span>{lang === 'en' ? 'العربية' : 'English'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              className="min-h-[40px] min-w-[40px] p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        {!firebaseUser ? (
          <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left Copy & Sign-in */}
            <div className="lg:col-span-6 flex flex-col justify-center space-y-8">
              <div className="space-y-4">
                <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white [text-wrap:balance] leading-[1.12]">
                  {t(lang, 'signInTitle')}
                </h1>
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  {t(lang, 'signInSubtitle')}
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={authLoading}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center gap-3 transition-colors shadow-sm cursor-pointer"
                >
                  {authLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                      />
                    </svg>
                  )}
                  <span>
                    {authLoading ? t(lang, 'signingIn') : t(lang, 'continueWithGoogle')}
                  </span>
                </button>
                {authError && (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
                    {authError}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <Video className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span>{t(lang, 'authFeatureVideo')}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t(lang, 'authFeatureVideoDesc')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <UserCheck className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span>{t(lang, 'authFeatureDiscovery')}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t(lang, 'authFeatureDiscoveryDesc')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <MessageSquare className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <span>{t(lang, 'authFeatureSync')}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t(lang, 'authFeatureSyncDesc')}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Visual */}
            <div className="lg:col-span-6 flex">
              <div className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/auth_welcome_hero_1795811674061.jpg"
                    alt="Two people smiling during a video call on a tablet"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full min-h-[320px] lg:min-h-[440px] object-cover"
                  />
                ) : (
                  <div className="w-full min-h-[360px] flex flex-col items-center justify-center bg-gradient-to-br from-teal-700/10 to-slate-200/40 dark:to-slate-800/40 p-8 text-center">
                    <Video className="w-12 h-12 text-teal-700 dark:text-teal-400 mb-3" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {t(lang, 'appTagline')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* First-time Registration Form for Unique Username */
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t(lang, 'completeProfileTitle')}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t(lang, 'completeProfileSubtitle')}
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label
                  htmlFor="reg-username"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  {t(lang, 'usernameLabel')}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 start-3.5 flex items-center text-slate-400 text-sm select-none">
                    @
                  </span>
                  <input
                    id="reg-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                    placeholder="omar_99"
                    autoComplete="username"
                    dir="ltr"
                    className="w-full ps-8 pe-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    {validationReason || t(lang, 'usernameHint')}
                  </span>
                  {availability === 'checking' && (
                    <span className="text-slate-500 inline-flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t(lang, 'usernameChecking')}
                    </span>
                  )}
                  {availability === 'available' && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t(lang, 'usernameAvailable')}
                    </span>
                  )}
                  {availability === 'taken' && (
                    <span className="text-rose-600 dark:text-rose-400 font-medium">
                      {t(lang, 'usernameTaken')}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-displayname"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  {t(lang, 'displayNameLabel')}
                </label>
                <input
                  id="reg-displayname"
                  type="text"
                  required
                  maxLength={60}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-bio"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  {t(lang, 'bioLabel')}
                </label>
                <input
                  id="reg-bio"
                  type="text"
                  maxLength={160}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t(lang, 'bioPlaceholder')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {submitError && (
                <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
                  {submitError}
                </p>
              )}

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t(lang, 'signOut')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || availability !== 'available' || !displayName.trim()}
                  className="flex-1 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {submitting ? t(lang, 'creatingAccount') : t(lang, 'createAccountBtn')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
