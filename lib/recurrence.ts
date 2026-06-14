/**
 * Recurrence date computation for recurring sessions.
 *
 * The `recurrence_pattern` string is produced by
 * components/RecurringSessionToggle.tsx and stored on the parent session:
 *
 *   - "weekly_<d>[_<d>...]"    weekly on the given weekday(s)
 *   - "biweekly_<d>[_<d>...]"  every two weeks on the given weekday(s)
 *   - "monthly"                monthly on the seed session's day-of-month
 *   - legacy bare "weekly" / "biweekly" (no day suffix, e.g. from
 *     app/admin/events) fall back to the seed session's own weekday.
 *
 * IMPORTANT — day indexing: the toggle's day list is
 *   ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']  (Mon = 0 ... Sun = 6),
 * which is NOT JavaScript's Date.getDay() (Sun = 0 ... Sat = 6). The bug this
 * module fixes: the cron generator only ever matched the bare literals
 * 'weekly'/'biweekly'/'monthly', so every "weekly_N" parent fell through all
 * branches and produced ZERO child dates. As a result the recurring-session
 * generator never created a single child session, and the home feed went empty
 * once the seed sessions aged out. See app/api/cron/recurring-sessions.
 */

export interface RecurrenceInput {
  /** Seed session date, YYYY-MM-DD. */
  date: string;
  recurrence_pattern: string | null;
  /** YYYY-MM-DD, or null for open-ended. */
  recurrence_end_date: string | null;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** RecurringSessionToggle weekday index (Mon=0..Sun=6) -> JS getDay() (Sun=0..Sat=6). */
function appDowToJs(appIdx: number): number {
  return (appIdx + 1) % 7;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Local-midnight Monday of the week containing `d` — the biweekly parity anchor. */
function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  const diffToMonday = (m.getDay() + 6) % 7; // Mon=0
  m.setDate(m.getDate() - diffToMonday);
  return m;
}

/**
 * Compute the upcoming occurrence dates (YYYY-MM-DD) for a recurring parent
 * session within `[today+1, today+lookaheadDays]`, honoring an optional end
 * date. Pure and deterministic given `today` — safe to unit test.
 */
export function computeRecurrenceDates(parent: RecurrenceInput, today: Date, lookaheadDays: number): string[] {
  const pattern = parent.recurrence_pattern;
  if (!pattern) return [];

  const parts = pattern.split('_');
  const frequency = parts[0];
  const dayIdxs = parts
    .slice(1)
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  const endWindow = new Date(start);
  endWindow.setDate(endWindow.getDate() + lookaheadDays);

  if (parent.recurrence_end_date) {
    const recEnd = new Date(parent.recurrence_end_date + 'T23:59:59');
    if (recEnd < start) return [];
    if (recEnd < endWindow) endWindow.setTime(recEnd.getTime());
  }

  const originalDate = new Date(parent.date + 'T00:00:00');
  if (Number.isNaN(originalDate.getTime())) return [];

  const dates: string[] = [];

  if (frequency === 'weekly' || frequency === 'biweekly') {
    // Target JS weekdays. Legacy bare "weekly"/"biweekly" with no day suffix
    // falls back to the seed session's own weekday.
    const targetJsDows = dayIdxs.length > 0 ? dayIdxs.map(appDowToJs) : [originalDate.getDay()];
    const anchorMonday = mondayOf(originalDate);

    // Walk day by day from tomorrow through the window; cheap (<= ~14 iters)
    // and trivially correct for multi-day patterns.
    const cursor = new Date(start);
    cursor.setDate(cursor.getDate() + 1); // strictly after today
    while (cursor <= endWindow) {
      if (cursor >= originalDate && targetJsDows.includes(cursor.getDay())) {
        if (frequency === 'weekly') {
          dates.push(toISODate(cursor));
        } else {
          // biweekly: only weeks an even number of weeks from the seed week.
          const weeks = Math.round((mondayOf(cursor).getTime() - anchorMonday.getTime()) / MS_PER_WEEK);
          if (weeks % 2 === 0) dates.push(toISODate(cursor));
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (frequency === 'monthly') {
    const dayOfMonth = originalDate.getDate();
    const cursor = new Date(originalDate);
    while (cursor <= endWindow) {
      if (cursor > start) dates.push(toISODate(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
      // Clamp for short months (e.g. the 31st -> last day of February).
      cursor.setDate(Math.min(dayOfMonth, daysInMonth(cursor.getFullYear(), cursor.getMonth())));
    }
  }

  return dates;
}
