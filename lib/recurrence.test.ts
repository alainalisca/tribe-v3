import { describe, it, expect } from 'vitest';
import { computeRecurrenceDates, type RecurrenceInput } from './recurrence';

// Fixed reference day: 2026-06-14 is a SUNDAY. The weekly window of 7 days
// that follows is Mon 2026-06-15 .. Sun 2026-06-21.
const TODAY = new Date(2026, 5, 14); // local-midnight Sun 2026-06-14
const LOOKAHEAD = 7;

function input(pattern: string | null, date = '2026-04-01', end: string | null = null): RecurrenceInput {
  return { date, recurrence_pattern: pattern, recurrence_end_date: end };
}

describe('computeRecurrenceDates', () => {
  it('sanity: the reference TODAY is a Sunday', () => {
    expect(TODAY.getDay()).toBe(0);
  });

  it('returns [] for a null pattern', () => {
    expect(computeRecurrenceDates(input(null), TODAY, LOOKAHEAD)).toEqual([]);
  });

  // The regression that broke the feed: "weekly_N" (N = Mon-indexed weekday)
  // must produce the next occurrence, not fall through to [].
  it('weekly_0 = every Monday -> next Monday in window', () => {
    expect(computeRecurrenceDates(input('weekly_0'), TODAY, LOOKAHEAD)).toEqual(['2026-06-15']);
  });

  it('weekly_2 = every Wednesday', () => {
    expect(computeRecurrenceDates(input('weekly_2'), TODAY, LOOKAHEAD)).toEqual(['2026-06-17']);
  });

  it('weekly_6 = every Sunday (Mon-indexed 6 -> JS Sunday)', () => {
    expect(computeRecurrenceDates(input('weekly_6'), TODAY, LOOKAHEAD)).toEqual(['2026-06-21']);
  });

  it('weekly with multiple days (Mon + Wed) returns both, in order', () => {
    expect(computeRecurrenceDates(input('weekly_0_2'), TODAY, LOOKAHEAD)).toEqual(['2026-06-15', '2026-06-17']);
  });

  it('legacy bare "weekly" falls back to the seed session weekday (Wed seed -> Wed)', () => {
    // 2026-06-03 is a Wednesday.
    expect(computeRecurrenceDates(input('weekly', '2026-06-03'), TODAY, LOOKAHEAD)).toEqual(['2026-06-17']);
  });

  it('biweekly_0 INCLUDES the week that is an even number of weeks from the seed', () => {
    // Seed Mon 2026-06-01; Mon 2026-06-15 is exactly 2 weeks later -> included.
    expect(computeRecurrenceDates(input('biweekly_0', '2026-06-01'), TODAY, LOOKAHEAD)).toEqual(['2026-06-15']);
  });

  it('biweekly_0 EXCLUDES the off-parity week', () => {
    // Seed Mon 2026-06-08; Mon 2026-06-15 is 1 week later (odd) -> excluded,
    // and the next valid Monday (06-22) is outside the 7-day window.
    expect(computeRecurrenceDates(input('biweekly_0', '2026-06-08'), TODAY, LOOKAHEAD)).toEqual([]);
  });

  it('monthly emits the day-of-month occurrence inside the window', () => {
    // Seed on the 20th; next 20th (2026-06-20) is within Mon15..Sun21.
    expect(computeRecurrenceDates(input('monthly', '2026-04-20'), TODAY, LOOKAHEAD)).toEqual(['2026-06-20']);
  });

  it('monthly emits nothing when the day-of-month is outside the window', () => {
    // Seed on the 26th; 2026-06-26 is past today+7.
    expect(computeRecurrenceDates(input('monthly', '2026-04-26'), TODAY, LOOKAHEAD)).toEqual([]);
  });

  it('respects recurrence_end_date that falls inside the window', () => {
    // End Tue 2026-06-16 caps the window: Mon 06-15 kept, Wed 06-17 dropped.
    expect(computeRecurrenceDates(input('weekly_0_2', '2026-04-01', '2026-06-16'), TODAY, LOOKAHEAD)).toEqual([
      '2026-06-15',
    ]);
  });

  it('returns [] when recurrence_end_date is already in the past', () => {
    expect(computeRecurrenceDates(input('weekly_0', '2026-04-01', '2026-05-01'), TODAY, LOOKAHEAD)).toEqual([]);
  });

  it('returns [] for an unparseable seed date', () => {
    expect(computeRecurrenceDates(input('weekly_0', 'not-a-date'), TODAY, LOOKAHEAD)).toEqual([]);
  });

  it('never emits a date on or before today', () => {
    const out = computeRecurrenceDates(input('weekly_0_1_2_3_4_5_6'), TODAY, LOOKAHEAD);
    expect(out).not.toContain('2026-06-14');
    expect(out[0]).toBe('2026-06-15');
    expect(out).toHaveLength(7); // all 7 weekdays selected -> one each day Mon..Sun
  });
});
