// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { parseSessionDate, getSessionDayOfMonth, getSessionWeekday, formatSessionDate } from './utils';

/**
 * 2026-08-23 is a Sunday. In a negative-offset zone (America/Bogota, UTC-5) the
 * naive `new Date('2026-08-23')` lands on the evening of the 22nd, so any helper
 * that is genuinely timezone-stable must still report the 23rd / Sunday there.
 * Each test sets process.env.TZ, which Node honors for subsequent Date reads, so
 * the assertions run under three different zones. A witness on the NAIVE pattern
 * proves the zone override actually took effect (otherwise the test is vacuous).
 */
const ISO = '2026-08-23';
const SUNDAY = 0;
const ORIGINAL_TZ = process.env.TZ;

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('session date helpers are timezone-stable', () => {
  for (const tz of ['America/Bogota', 'UTC', 'Asia/Tokyo']) {
    it(`holds the calendar day under ${tz}`, () => {
      process.env.TZ = tz;

      // Witness: the naive parse DOES drift to the 22nd under Bogota and stays 23
      // elsewhere, proving TZ is really being applied in this test.
      expect(new Date(ISO).getDate()).toBe(tz === 'America/Bogota' ? 22 : 23);

      // Helpers: stable at the true calendar day regardless of zone.
      expect(getSessionDayOfMonth(ISO)).toBe(23);
      expect(getSessionWeekday(ISO)).toBe(SUNDAY);
      expect(parseSessionDate(ISO).toISOString()).toBe('2026-08-23T00:00:00.000Z');
      expect(formatSessionDate(ISO, 'en', { day: 'numeric' })).toBe('23');
    });
  }

  it('formatSessionDate keeps UTC even if a caller passes a conflicting timeZone', () => {
    process.env.TZ = 'America/Bogota';
    const out = formatSessionDate(ISO, 'en', {
      day: 'numeric',
      timeZone: 'America/Bogota',
    } as Intl.DateTimeFormatOptions);
    expect(out).toBe('23');
  });

  it('formatSessionDate maps language to locale and passes through options', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(formatSessionDate(ISO, 'en', { weekday: 'long' })).toContain('Sunday');
    expect(formatSessionDate(ISO, 'es', { weekday: 'long' }).toLowerCase()).toContain('domingo');
  });

  it('invalid input yields Invalid Date / NaN, like the raw sites it replaces', () => {
    expect(Number.isNaN(parseSessionDate('not-a-date').getTime())).toBe(true);
    expect(Number.isNaN(getSessionWeekday('not-a-date'))).toBe(true);
    expect(Number.isNaN(getSessionDayOfMonth('not-a-date'))).toBe(true);
  });
});
