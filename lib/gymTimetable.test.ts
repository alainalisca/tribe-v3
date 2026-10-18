import { describe, it, expect } from 'vitest';
import { gymTimetable, gymTimetableWindow, sessionEndsAtBogota } from './gymTimetable';

/** T-JOIN1 Part C: the gym page lists the next seven days, never a finished class. */
// 20:00 in Medellín on Sunday 18 Oct = 01:00 UTC on the 19th.
const NOW = new Date('2026-10-19T01:00:00Z');
const row = (date: string, start_time: string | null, duration: number | null = 60) => ({ date, start_time, duration });

describe('gymTimetable', () => {
  it('takes today from Bogotá, not UTC, and runs seven days', () => {
    expect(gymTimetableWindow(NOW)).toEqual({ from: '2026-10-18', to: '2026-10-24' });
  });

  it("drops a class that already ended and keeps tonight's", () => {
    const out = gymTimetable(
      [row('2026-10-18', '06:00:00'), row('2026-10-18', '19:30:00'), row('2026-10-18', '20:30:00')],
      NOW
    );
    // 06:00 ended; 19:30 + 60 min runs until 20:30, still on; 20:30 is ahead.
    expect(out.map((r) => r.start_time)).toEqual(['19:30:00', '20:30:00']);
  });

  it('leaves out anything past the seventh day', () => {
    const out = gymTimetable([row('2026-10-24', '07:00:00'), row('2026-10-25', '07:00:00')], NOW);
    expect(out.map((r) => r.date)).toEqual(['2026-10-24']);
  });

  it('a session with no start time runs to the end of its day', () => {
    expect(sessionEndsAtBogota(row('2026-10-18', null)).toISOString()).toBe('2026-10-19T04:59:59.000Z');
    expect(gymTimetable([row('2026-10-18', null)], NOW)).toHaveLength(1);
  });

  it('uses the duration, 60 minutes when unset', () => {
    expect(sessionEndsAtBogota(row('2026-10-18', '19:00', 90)).toISOString()).toBe('2026-10-19T01:30:00.000Z');
    expect(sessionEndsAtBogota(row('2026-10-18', '19:00', null)).toISOString()).toBe('2026-10-19T01:00:00.000Z');
  });
});
