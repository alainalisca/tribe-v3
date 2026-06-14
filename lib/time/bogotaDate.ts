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
