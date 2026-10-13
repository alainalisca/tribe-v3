// Bogotá-local calendar-date helpers.
//
// Why this exists: Vercel runs crons in UTC, but Tribe's users are in
// Colombia (America/Bogota, UTC-5, no DST) and `sessions.date` stores the
// LOCAL calendar date the host picked. Computing "today" with
// `new Date().toISOString().split('T')[0]` gives the UTC date, which for the
// ~5-hour window of 7pm–midnight Bogotá has already rolled to tomorrow. That
// mismatch silently dropped evening-session reminders (audit T0-9 / cron
// findings). Always derive day boundaries through these helpers in cron code.

const BOGOTA_TZ = 'America/Bogota';

/**
 * App language -> Intl locale. A MAP, NOT A TERNARY, for the same reason
 * lib/dateLocale uses one: it reads as data, it extends without touching a
 * conditional, and it stays clear of the i18n lint rule, which cannot tell a
 * copy ternary from a locale one.
 */
const INTL_LOCALES: Record<string, string> = { es: 'es-CO', en: 'en-US' };

/**
 * Current calendar date in Bogotá as 'YYYY-MM-DD'.
 * `en-CA` formats as ISO YYYY-MM-DD; the timeZone option anchors it to Bogotá.
 */
export function bogotaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * A timestamptz rendered as 'dd MMM HH:mm' in Bogotá local time.
 *
 * For reading a log of events that happened, which is what the admin leads
 * table is. pass_leads.created_at is a timestamptz stored in UTC, and Vercel
 * renders in UTC, so without the timeZone option a lead claimed at 8pm in
 * Medellín reads as the next day -- the same off-by-one that silently dropped
 * evening session reminders and got these helpers written in the first place.
 *
 * NO SECONDS AND NO YEAR. This is scanned, not audited: the question an admin
 * asks of this column is "how fresh is this lead", and a year on every row of a
 * list that is newest-first is noise. The full timestamp is a row away in the
 * database if it is ever needed.
 *
 * Returns an empty string for an unparseable value rather than "Invalid Date",
 * which renders as a defect in a table cell.
 */
export function bogotaDateTimeLabel(iso: string | null | undefined, language = 'es'): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(INTL_LOCALES[language] ?? INTL_LOCALES.en, {
    timeZone: BOGOTA_TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Bogotá calendar date offset by `days` (negative for past), as 'YYYY-MM-DD'.
 * Anchors at noon UTC of the Bogotá date so adding days can't cross a boundary
 * incorrectly, then reads the resulting calendar date back.
 */
export function bogotaDateOffset(days: number, now: Date = new Date()): string {
  const anchor = new Date(`${bogotaToday(now)}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(anchor);
}

// ── Wall-clock ↔ UTC conversion ──────────────────────────────────────────────
//
// America/Bogota is UTC-5 all year (no DST), so the conversion is fixed
// arithmetic. Everything reads and writes UTC fields only, making the result
// independent of the device/server timezone by construction.

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * A datetime-local value, read as Bogotá time, to a UTC ISO string.
 * '2026-10-12T21:00' → '2026-10-13T02:00:00.000Z'.
 * Returns null for anything that is not a real calendar date and time.
 */
export function bogotaLocalToUtc(localValue: string): string | null {
  const match = LOCAL_VALUE.exec(localValue);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  if (hour > 23 || minute > 59 || second > 59) return null;

  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wallClock);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return new Date(wallClock + BOGOTA_OFFSET_MS).toISOString();
}

/**
 * A stored timestamptz to the 'YYYY-MM-DDTHH:mm' Bogotá value a
 * datetime-local input expects. '2026-10-13T02:00:00Z' → '2026-10-12T21:00'.
 * Returns null for an empty or unparseable value.
 */
export function utcToBogotaLocal(iso: string): string | null {
  if (!iso) return null;
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return null;
  return new Date(instant - BOGOTA_OFFSET_MS).toISOString().slice(0, 16);
}

const TIME_VALUE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Combine a Bogotá-local DATE ('YYYY-MM-DD') and TIME ('HH:MM' or 'HH:MM:SS')
 * into the correct UTC Date. Returns null for bad input.
 */
export function sessionStartUtc(date: string, startTime: string): Date | null {
  const dp = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tp = TIME_VALUE.exec(startTime);
  if (!dp || !tp) return null;

  const [year, month, day] = dp.slice(1).map(Number);
  const [hour, minute, second] = tp.slice(1).map((p) => Number(p ?? 0));
  if (hour > 23 || minute > 59 || second > 59) return null;

  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wallClock);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return new Date(wallClock + BOGOTA_OFFSET_MS);
}
