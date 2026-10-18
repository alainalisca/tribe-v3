import { bogotaDateOffset, bogotaToday } from '@/lib/time/bogotaDate';

/**
 * T-JOIN1 Part C. What a gym's public page (/g/<slug>) lists: the next seven
 * days, today included, and never a session that has already finished.
 *
 * Sessions are stored as Bogotá wall-clock date and time; Colombia keeps
 * UTC-5 all year, so the end instant is that wall clock at -05:00 plus the
 * duration (60 minutes when unset). Before this, the page took "today" from
 * the UTC date (after 7 pm in Medellín tonight's classes vanished) and listed
 * classes that ended hours ago.
 */
export const GYM_TIMETABLE_DAYS = 7;

/** The query window: today through six days out, as Bogotá dates. */
export function gymTimetableWindow(now: Date = new Date()): { from: string; to: string } {
  return { from: bogotaToday(now), to: bogotaDateOffset(GYM_TIMETABLE_DAYS - 1, now) };
}

export function sessionEndsAtBogota(s: { date: string; start_time: string | null; duration?: number | null }): Date {
  if (!s.start_time) return new Date(`${s.date}T23:59:59-05:00`);
  const hhmm = s.start_time.slice(0, 5);
  return new Date(new Date(`${s.date}T${hhmm}:00-05:00`).getTime() + (s.duration || 60) * 60_000);
}

export function gymTimetable<T extends { date: string; start_time: string | null; duration?: number | null }>(
  rows: T[],
  now: Date = new Date()
): T[] {
  const { from, to } = gymTimetableWindow(now);
  return rows.filter((r) => r.date >= from && r.date <= to && sessionEndsAtBogota(r) > now);
}
