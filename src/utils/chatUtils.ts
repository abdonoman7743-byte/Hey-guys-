import type { SupportedLanguage } from '../types/domain';

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

export interface UsernameValidationResult {
  valid: boolean;
  normalized: string;
  reason?: 'too_short' | 'too_long' | 'invalid_chars';
}

export function validateUsername(raw: string): UsernameValidationResult {
  const normalized = normalizeUsername(raw);
  if (normalized.length < 3) {
    return { valid: false, normalized, reason: 'too_short' };
  }
  if (normalized.length > 24) {
    return { valid: false, normalized, reason: 'too_long' };
  }
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    return { valid: false, normalized, reason: 'invalid_chars' };
  }
  return { valid: true, normalized };
}

export function getDeterministicPairId(uidA: string, uidB: string): string {
  const sorted = [uidA.trim(), uidB.trim()].sort();
  return `${sorted[0]}__${sorted[1]}`;
}

export function getSortedParticipants(uidA: string, uidB: string): [string, string] {
  const sorted = [uidA.trim(), uidB.trim()].sort();
  return [sorted[0], sorted[1]];
}

export function formatCallDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function timestampToMillis(ts: any): number | null {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  return null;
}

export function formatLastSeen(
  ts: any,
  lang: SupportedLanguage,
  nowMs: number = Date.now()
): string {
  const ms = timestampToMillis(ts);
  if (!ms) {
    return lang === 'ar' ? 'غير متصل' : 'Offline';
  }
  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diffSec < 60) {
    return lang === 'ar' ? 'آخر ظهور الآن' : 'Last seen just now';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return lang === 'ar' ? `آخر ظهور قبل ${diffMin} د` : `Last seen ${diffMin}m ago`;
  }
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) {
    return lang === 'ar' ? `آخر ظهور قبل ${diffHrs} س` : `Last seen ${diffHrs}h ago`;
  }
  const diffDays = Math.floor(diffHrs / 24);
  return lang === 'ar' ? `آخر ظهور قبل ${diffDays} ي` : `Last seen ${diffDays}d ago`;
}

export function formatMessageTime(ts: any, lang: SupportedLanguage): string {
  const ms = timestampToMillis(ts);
  if (!ms) return '';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function sanitizeMessageText(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim().slice(0, 4000);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
