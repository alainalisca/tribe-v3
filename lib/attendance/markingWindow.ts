/**
 * T-AV2. When a host may mark attendance: from 30 minutes before the session
 * starts until 72 hours after it ends, on Medellin wall-clock time.
 *
 * av_mark_attendance (migration 224) enforces the same rule on the server and
 * is the authority. This copy only decides what the host UI shows, so a host
 * is not offered buttons the server would refuse. Keep the two in step:
 * markingWindow.test.ts pins the same edges the rehearsal's S11, C10 and C11
 * arms pin.
 *
 * America/Bogota has no daylight saving, so a fixed -05:00 offset is exact.
 */
export const OPENS_BEFORE_START_MS = 30 * 60 * 1000;
export const CLOSES_AFTER_END_MS = 72 * 60 * 60 * 1000;

export type MarkingWindowState = 'not_yet' | 'open' | 'closed';

interface SessionTimes {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM or HH:MM:SS
  endTime: string | null;
  durationMinutes: number | null;
}

function bogotaInstant(date: string, time: string): Date {
  const hhmmss = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return new Date(`${date}T${hhmmss}-05:00`);
}

/** Start and end as instants. No end: start plus duration (60 if missing). An end before the start crosses midnight. */
export function sessionBounds(t: SessionTimes): { start: Date; end: Date } {
  const start = bogotaInstant(t.date, t.startTime);
  if (t.endTime) {
    let end = bogotaInstant(t.date, t.endTime);
    if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }
  return { start, end: new Date(start.getTime() + (t.durationMinutes ?? 60) * 60 * 1000) };
}

export function markingWindowState(t: SessionTimes, now: Date = new Date()): MarkingWindowState {
  const { start, end } = sessionBounds(t);
  if (now.getTime() < start.getTime() - OPENS_BEFORE_START_MS) return 'not_yet';
  if (now.getTime() > end.getTime() + CLOSES_AFTER_END_MS) return 'closed';
  return 'open';
}
