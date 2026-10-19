import { describe, it, expect } from 'vitest';
import { markingWindowState, sessionBounds } from './markingWindow';

// 2026-10-05 07:00 in Medellin is 12:00 UTC (Bogota is UTC-5, no DST).
const SESSION = { date: '2026-10-05', startTime: '07:00:00', endTime: '08:00:00', durationMinutes: 60 };
const utc = (iso: string) => new Date(iso);

describe('sessionBounds', () => {
  it('reads date and time as Medellin wall-clock', () => {
    const { start, end } = sessionBounds(SESSION);
    expect(start.toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-05T13:00:00.000Z');
  });

  it('with no end time, ends at start plus duration', () => {
    const { end } = sessionBounds({ ...SESSION, endTime: null, durationMinutes: 90 });
    expect(end.toISOString()).toBe('2026-10-05T13:30:00.000Z');
  });

  it('with no end time and no duration, assumes 60 minutes (same as the server)', () => {
    const { end } = sessionBounds({ ...SESSION, endTime: null, durationMinutes: null });
    expect(end.toISOString()).toBe('2026-10-05T13:00:00.000Z');
  });

  it('an end before the start crosses midnight', () => {
    const { end } = sessionBounds({ date: '2026-10-05', startTime: '23:00', endTime: '00:30', durationMinutes: 90 });
    expect(end.toISOString()).toBe('2026-10-06T05:30:00.000Z');
  });
});

describe('markingWindowState (mirrors av_mark_attendance)', () => {
  it('opens exactly 30 minutes before the start, not a minute earlier', () => {
    expect(markingWindowState(SESSION, utc('2026-10-05T11:30:00Z'))).toBe('open');
    expect(markingWindowState(SESSION, utc('2026-10-05T11:29:00Z'))).toBe('not_yet');
  });

  it('stays open through the session and for 72 hours after the end', () => {
    expect(markingWindowState(SESSION, utc('2026-10-05T12:30:00Z'))).toBe('open');
    expect(markingWindowState(SESSION, utc('2026-10-08T13:00:00Z'))).toBe('open');
  });

  it('closes after 72 hours past the end', () => {
    expect(markingWindowState(SESSION, utc('2026-10-08T13:01:00Z'))).toBe('closed');
  });
});
