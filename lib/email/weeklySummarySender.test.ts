import { describe, it, expect } from 'vitest';
import { previousWeekRange } from './weeklySummarySender';

/**
 * Tests for the date math used by the Monday weekly summary cron.
 * The function is pure (takes `now` as a param) so we can pass
 * arbitrary anchor times and assert the [Monday → Monday) window
 * stays right across every day of the week + DST boundaries +
 * year boundaries.
 */

describe('previousWeekRange', () => {
  it('returns the previous Mon→Mon window when called on a Monday', () => {
    // Mon 2026-05-11 00:00 UTC. The previous week is
    // Mon 2026-05-04 → Mon 2026-05-11 (exclusive).
    const now = new Date('2026-05-11T08:00:00Z'); // 8am Monday UTC
    const range = previousWeekRange(now);
    expect(range.fromIso).toBe('2026-05-04T00:00:00.000Z');
    expect(range.toIso).toBe('2026-05-11T00:00:00.000Z');
  });

  it('returns the same previous Mon→Mon window when called Tuesday-Sunday', () => {
    // Wednesday in the middle of the week — the previous week's
    // window should be the SAME as Monday's (we always look at the
    // last completed calendar week).
    const now = new Date('2026-05-13T14:30:00Z'); // Wed 2:30pm UTC
    const range = previousWeekRange(now);
    expect(range.fromIso).toBe('2026-05-04T00:00:00.000Z');
    expect(range.toIso).toBe('2026-05-11T00:00:00.000Z');
  });

  it('handles Sunday correctly (last day of the previous week)', () => {
    // Sunday 2026-05-17 — still in the same calendar week as
    // Mon 2026-05-11. The "previous" week should be 5/4 → 5/11.
    const now = new Date('2026-05-17T23:59:59Z');
    const range = previousWeekRange(now);
    expect(range.fromIso).toBe('2026-05-04T00:00:00.000Z');
    expect(range.toIso).toBe('2026-05-11T00:00:00.000Z');
  });

  it('crosses year boundary cleanly', () => {
    // Wed 2025-01-01 — the "previous week" runs Mon 2024-12-23
    // → Mon 2024-12-30. Yes, that's a 7-day window starting in
    // the previous year.
    const now = new Date('2025-01-01T12:00:00Z');
    const range = previousWeekRange(now);
    expect(range.fromIso).toBe('2024-12-23T00:00:00.000Z');
    expect(range.toIso).toBe('2024-12-30T00:00:00.000Z');
  });

  it('always produces a 7-day exact window', () => {
    // Run across several anchors. From and To should be exactly
    // 7 * 24 * 60 * 60 * 1000 = 604800000 ms apart for all of them.
    const anchors = [
      '2026-05-11T08:00:00Z',
      '2026-05-13T14:30:00Z',
      '2026-05-17T23:59:59Z',
      '2025-01-01T12:00:00Z',
      '2026-03-15T00:00:00Z',
    ];
    for (const iso of anchors) {
      const { fromIso, toIso } = previousWeekRange(new Date(iso));
      const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
      expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('always anchors both edges to UTC midnight', () => {
    const range = previousWeekRange(new Date('2026-05-13T14:30:00Z'));
    expect(range.fromIso.endsWith('T00:00:00.000Z')).toBe(true);
    expect(range.toIso.endsWith('T00:00:00.000Z')).toBe(true);
  });

  it('both edges are Mondays', () => {
    // 1 = Monday in UTC day-of-week.
    const anchors = ['2026-05-11T08:00:00Z', '2026-05-13T14:30:00Z', '2025-01-01T12:00:00Z'];
    for (const iso of anchors) {
      const { fromIso, toIso } = previousWeekRange(new Date(iso));
      expect(new Date(fromIso).getUTCDay()).toBe(1);
      expect(new Date(toIso).getUTCDay()).toBe(1);
    }
  });
});
