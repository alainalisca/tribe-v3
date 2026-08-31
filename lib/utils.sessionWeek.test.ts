// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { getSessionWeekIndex, computeWeeklyStreak } from './utils';

/**
 * 2026-08-22 is a Saturday and 2026-08-23 a Sunday, so they fall in DIFFERENT
 * weeks (weeks start Sunday). Each test sets process.env.TZ, which Node honors,
 * and a witness on the naive local parse proves the zone override is live so the
 * assertions are not vacuous.
 */
const ZONES = ['America/Bogota', 'UTC', 'Asia/Tokyo'];
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('getSessionWeekIndex', () => {
  for (const tz of ZONES) {
    it(`buckets by Sunday-start week, timezone-stable under ${tz}`, () => {
      process.env.TZ = tz;
      expect(new Date('2026-08-23').getDate()).toBe(tz === 'America/Bogota' ? 22 : 23); // witness

      const wSun = getSessionWeekIndex('2026-08-23'); // a Sunday
      // Consecutive real weeks -> consecutive indices.
      expect(getSessionWeekIndex('2026-08-16')).toBe(wSun - 1);
      expect(getSessionWeekIndex('2026-08-30')).toBe(wSun + 1);
      // Same Sun..Sat week shares one index.
      expect(getSessionWeekIndex('2026-08-24')).toBe(wSun); // Monday
      expect(getSessionWeekIndex('2026-08-29')).toBe(wSun); // Saturday
      // Boundary: the Saturday before is the PREVIOUS week.
      expect(getSessionWeekIndex('2026-08-22')).toBe(wSun - 1);
    });
  }

  it('regression: five sessions in five different weeks do NOT collapse to one bucket', () => {
    process.env.TZ = 'America/Bogota';
    const indices = new Set(
      ['2026-08-02', '2026-08-10', '2026-08-19', '2026-08-30', '2026-07-01'].map(getSessionWeekIndex)
    );
    // The exact old bug: that math bucketed all of these to 0 (size 1).
    expect(indices.size).toBe(5);
  });
});

describe('computeWeeklyStreak', () => {
  const CUR = 100;

  it('counts consecutive weeks including the current in-progress week (streak > 1)', () => {
    expect(computeWeeklyStreak(new Set([100, 99, 98]), CUR)).toBe(3);
  });

  it('the current in-progress week counts when it has a session', () => {
    expect(computeWeeklyStreak(new Set([100]), CUR)).toBe(1);
  });

  it('an empty current week does NOT break a run of completed weeks', () => {
    // No session THIS week yet, but the last two weeks have one -> still 2.
    expect(computeWeeklyStreak(new Set([99, 98]), CUR)).toBe(2);
  });

  it('a completed gap week breaks the streak', () => {
    // Current + last week present, week 98 missing -> stops there.
    expect(computeWeeklyStreak(new Set([100, 99, 97]), CUR)).toBe(2);
  });

  it('no attendance is a streak of 0', () => {
    expect(computeWeeklyStreak(new Set<number>(), CUR)).toBe(0);
  });
});
