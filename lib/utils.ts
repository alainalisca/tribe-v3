import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert 24-hour time (HH:MM:SS or HH:MM) to 12-hour format
export function formatTime12Hour(time: string): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

/**
 * Session dates in the DB are bare calendar dates, `YYYY-MM-DD`, with no time or
 * zone. The whole family below exists to keep that calendar day intact instead
 * of letting the runtime timezone shift it by a day.
 *
 * THE BUG THESE PREVENT: `new Date('2026-08-23')` parses as UTC midnight, and
 * reading it back in a negative-offset zone (Medellin is UTC-5) lands on the
 * evening BEFORE, so the day prints, buckets, or compares as the 22nd. Two
 * things are required, together, to cancel that:
 *   1. parse with an explicit `'T00:00:00Z'` anchor, so the instant is UTC
 *      midnight of exactly this date, and
 *   2. read it back in UTC, via `timeZone: 'UTC'` for display or `getUTC*` for
 *      calendar fields.
 * Drop EITHER half and the off-by-one returns. That is why `parseSessionDate`
 * owns the parse and the accessors below own the read: a caller never has to
 * remember both, and cannot half-apply it.
 */

/** en | es -> the locale the app renders session dates in. */
const SESSION_DATE_LOCALE: Record<'en' | 'es', string> = { en: 'en-US', es: 'es-CO' };

/**
 * Parse a bare `YYYY-MM-DD` session date to the Date at UTC midnight of that
 * day. Model: lib/recurrence.ts (`new Date(date + 'T00:00:00Z')`).
 *
 * IMPORTANT: any calendar field read off the returned Date MUST use the UTC
 * accessors (`getUTCDate`, `getUTCDay`, ...), never `getDate`/`getDay`, which
 * read local fields and reintroduce the shift. Prefer the named helpers
 * (getSessionDayOfMonth / getSessionWeekday) so this cannot be got wrong.
 * Invalid input yields an Invalid Date (accessors then return NaN), same as the
 * raw sites this replaces.
 */
export function parseSessionDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Day of month (1-31) of a session date, timezone-independent. */
export function getSessionDayOfMonth(iso: string): number {
  return parseSessionDate(iso).getUTCDate();
}

/** Weekday of a session date as `getUTCDay()` (0 = Sunday .. 6 = Saturday),
 *  timezone-independent. Matches the convention in lib/recurrence.ts. */
export function getSessionWeekday(iso: string): number {
  return parseSessionDate(iso).getUTCDay();
}

/**
 * Format a bare `YYYY-MM-DD` session date for display, in the given language,
 * without the day ever shifting by timezone. Based on the canonical pattern in
 * components/storefront/StorefrontSessionCard.tsx.
 *
 * `opts` are passed through to `toLocaleDateString` so callers keep their own
 * weekday/month/day formats, but `timeZone: 'UTC'` is applied LAST so it cannot
 * be overridden: the render must stay in the same UTC frame the parse used, or
 * the off-by-one returns (see the family comment above).
 */
export function formatSessionDate(iso: string, language: 'en' | 'es', opts?: Intl.DateTimeFormatOptions): string {
  return parseSessionDate(iso).toLocaleDateString(SESSION_DATE_LOCALE[language], { ...opts, timeZone: 'UTC' });
}
