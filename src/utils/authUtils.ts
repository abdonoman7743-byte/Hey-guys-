import type { SupportedLanguage } from '../types/domain';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type AuthFieldError = 'emailRequired' | 'emailInvalid' | 'passwordRequired' | 'passwordShort' | null;

export function validateEmail(email: string): AuthFieldError {
  const v = email.trim();
  if (!v) return 'emailRequired';
  if (!EMAIL_RE.test(v)) return 'emailInvalid';
  return null;
}

export function validatePassword(password: string, requireStrength = false): AuthFieldError {
  if (!password) return 'passwordRequired';
  if (requireStrength && password.length < 6) return 'passwordShort';
  return null;
}

const MESSAGES: Record<string, { en: string; ar: string }> = {
  'auth/invalid-email': { en: 'Enter a valid email address.', ar: 'أدخل بريداً إلكترونياً صحيحاً.' },
  'auth/user-not-found': { en: 'No account exists with this email.', ar: 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.' },
  'auth/wrong-password': { en: 'Incorrect password. Please try again.', ar: 'كلمة المرور غير صحيحة. حاول مرة أخرى.' },
  'auth/invalid-credential': { en: 'Incorrect email or password.', ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' },
  'auth/invalid-login-credentials': { en: 'Incorrect email or password.', ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' },
  'auth/user-disabled': { en: 'This account has been disabled.', ar: 'تم تعطيل هذا الحساب.' },
  'auth/email-already-in-use': { en: 'An account already exists with this email. Sign in instead.', ar: 'يوجد حساب بهذا البريد بالفعل. سجّل الدخول بدلاً من ذلك.' },
  'auth/weak-password': { en: 'Password must be at least 6 characters.', ar: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.' },
  'auth/too-many-requests': { en: 'Too many attempts. Please wait a moment and try again.', ar: 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.' },
  'auth/network-request-failed': { en: 'Network error. Check your connection and try again.', ar: 'خطأ في الاتصال. تحقق من الإنترنت وحاول مرة أخرى.' },
  'auth/popup-blocked': { en: 'The sign-in popup was blocked. Allow popups and try again.', ar: 'تم حظر نافذة تسجيل الدخول. اسمح بالنوافذ المنبثقة وحاول مرة أخرى.' },
  'auth/popup-closed-by-user': { en: 'Sign-in was cancelled.', ar: 'تم إلغاء تسجيل الدخول.' },
  'auth/cancelled-popup-request': { en: 'Sign-in was cancelled.', ar: 'تم إلغاء تسجيل الدخول.' },
  'auth/unauthorized-domain': { en: 'This domain is not authorized for sign-in. Add it to Firebase Authorized Domains.', ar: 'هذا النطاق غير مصرح له بتسجيل الدخول. أضفه إلى Authorized Domains في Firebase.' },
  'auth/operation-not-allowed': { en: 'This sign-in method is not enabled in Firebase.', ar: 'طريقة تسجيل الدخول هذه غير مفعّلة في Firebase.' },
  'auth/account-exists-with-different-credential': { en: 'An account already exists with this email using a different sign-in method.', ar: 'يوجد حساب بهذا البريد بطريقة تسجيل دخول مختلفة.' },
  'auth/missing-email': { en: 'Enter your email address first.', ar: 'أدخل بريدك الإلكتروني أولاً.' },
};

/** Maps a Firebase/Google auth error to a localized, user-readable message. */
export function authErrorMessage(err: unknown, lang: SupportedLanguage): string {
  const code = (err as { code?: string } | null)?.code;
  const entry = code ? MESSAGES[code] : undefined;
  if (entry) return entry[lang];
  return lang === 'ar' ? 'حدث خطأ غير متوقع. حاول مرة أخرى.' : 'Something went wrong. Please try again.';
}

/** Cancelled popups are not real failures; callers may choose to stay silent. */
export function isSilentAuthError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}
