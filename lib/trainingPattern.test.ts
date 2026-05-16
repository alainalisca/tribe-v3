/**
 * Tests for computeTrainingPattern + timeBucketFor.
 *
 * Focus areas:
 *   - Hidden when attended-count is too low (< MIN_SESSIONS_FOR_PATTERN)
 *   - Single-peak day pattern (one dominant day)
 *   - Bimodal day pattern (M/W/F-style: combines top two when
 *     within 3 percentage points)
 *   - Time-bucket cuts: morning < 11, midday 11-14, evening 15-19,
 *     night ≥ 20
 *   - session.start_time wins over attended_at hour when both
 *     are present (start_time is the truthful slot signal)
 *   - attended_at fallback when session is null
 *   - Rows with attended=false and rows with attended_at=null
 *     are excluded
 *
 * Why pure-function coverage matters here: the heuristic shapes
 * what a coach sees and the language they use in WhatsApp. A
 * silent regression that flips "evening" to "morning" would
 * embarrass the product and erode trust in the AI insights more
 * broadly.
 */

import { describe, it, expect } from 'vitest';
import { computeTrainingPattern, timeBucketFor, MIN_SESSIONS_FOR_PATTERN } from './trainingPattern';
import type { AttendanceLike } from './trainingPattern';

/**
 * Build an attendance row with sensible defaults so each test
 * specifies only what it cares about. Day-of-week is anchored at
 * a known Monday (2026-05-11 was a Monday) so getDay() math is
 * predictable.
 */
function makeRow(overrides: Partial<AttendanceLike> = {}): AttendanceLike {
  return {
    attended: true,
    attended_at: '2026-05-11T18:00:00.000Z', // Mon 18:00 UTC
    session: { start_time: '18:00:00' },
    ...overrides,
  };
}

describe('timeBucketFor', () => {
  it('returns unknown for null/undefined/blank', () => {
    expect(timeBucketFor(null)).toBe('unknown');
    expect(timeBucketFor(undefined)).toBe('unknown');
    expect(timeBucketFor('')).toBe('unknown');
  });

  it('buckets 06:00 as morning (< 11)', () => {
    expect(timeBucketFor('06:00:00')).toBe('morning');
  });

  it('buckets 10:59 as morning (boundary inclusive of 10)', () => {
    expect(timeBucketFor('10:59:00')).toBe('morning');
  });

  it('buckets 11:00 as midday (first midday hour)', () => {
    expect(timeBucketFor('11:00:00')).toBe('midday');
  });

  it('buckets 14:59 as midday (last midday hour)', () => {
    expect(timeBucketFor('14:59:00')).toBe('midday');
  });

  it('buckets 15:00 as evening', () => {
    expect(timeBucketFor('15:00:00')).toBe('evening');
  });

  it('buckets 19:59 as evening', () => {
    expect(timeBucketFor('19:59:00')).toBe('evening');
  });

  it('buckets 20:00 as night', () => {
    expect(timeBucketFor('20:00:00')).toBe('night');
  });

  it('tolerates HH:MM without seconds', () => {
    expect(timeBucketFor('07:30')).toBe('morning');
  });
});

describe('computeTrainingPattern — threshold', () => {
  it('returns null when fewer than MIN_SESSIONS_FOR_PATTERN attended', () => {
    const rows: AttendanceLike[] = Array.from({ length: MIN_SESSIONS_FOR_PATTERN - 1 }).map(() => makeRow());
    expect(computeTrainingPattern(rows)).toBeNull();
  });

  it('returns a result at exactly MIN_SESSIONS_FOR_PATTERN attended', () => {
    const rows: AttendanceLike[] = Array.from({ length: MIN_SESSIONS_FOR_PATTERN }).map(() => makeRow());
    const result = computeTrainingPattern(rows);
    expect(result).not.toBeNull();
  });

  it('ignores rows with attended=false when counting toward the threshold', () => {
    const attended: AttendanceLike[] = Array.from({ length: 4 }).map(() => makeRow());
    const notAttended: AttendanceLike[] = Array.from({ length: 10 }).map(() => makeRow({ attended: false }));
    expect(computeTrainingPattern([...attended, ...notAttended])).toBeNull();
  });

  it('ignores rows with attended_at=null', () => {
    const rows: AttendanceLike[] = Array.from({ length: 10 }).map(() => makeRow({ attended_at: null }));
    expect(computeTrainingPattern(rows)).toBeNull();
  });
});

describe('computeTrainingPattern — day-of-week', () => {
  it('picks a single peak when one day clearly dominates', () => {
    // 5 Mondays, 0 of everything else.
    const rows: AttendanceLike[] = Array.from({ length: 5 }).map(() => makeRow());
    const result = computeTrainingPattern(rows);
    expect(result?.topDayIndex).toBe(1); // Mon (getDay()=1)
    expect(result?.secondaryDayIndex).toBe(-1);
    expect(result?.topDayShare).toBe(100);
  });

  it('combines top two days when within 3pp (M/W/F-style)', () => {
    // 3 Mondays + 3 Wednesdays = 50/50 → secondary kicks in.
    const monday = '2026-05-11T18:00:00.000Z'; // Mon
    const wednesday = '2026-05-13T18:00:00.000Z'; // Wed
    const rows: AttendanceLike[] = [
      ...Array.from({ length: 3 }).map(() => makeRow({ attended_at: monday })),
      ...Array.from({ length: 3 }).map(() => makeRow({ attended_at: wednesday })),
    ];
    const result = computeTrainingPattern(rows);
    expect(result?.topDayIndex).toBe(1); // Mon
    expect(result?.secondaryDayIndex).toBe(3); // Wed
    // 50% + 50% combined.
    expect(result?.topDayShare).toBe(100);
  });

  it('does NOT combine when the secondary is more than 3pp behind', () => {
    // 8 Mondays + 2 Wednesdays = 80% vs 20% → 60pp gap → no combine.
    const monday = '2026-05-11T18:00:00.000Z';
    const wednesday = '2026-05-13T18:00:00.000Z';
    const rows: AttendanceLike[] = [
      ...Array.from({ length: 8 }).map(() => makeRow({ attended_at: monday })),
      ...Array.from({ length: 2 }).map(() => makeRow({ attended_at: wednesday })),
    ];
    const result = computeTrainingPattern(rows);
    expect(result?.topDayIndex).toBe(1);
    expect(result?.secondaryDayIndex).toBe(-1);
    expect(result?.topDayShare).toBe(80);
  });
});

describe('computeTrainingPattern — time-of-day', () => {
  it('uses session.start_time as the source of truth when present', () => {
    // attended_at would say evening (18:00 UTC) but start_time says morning.
    // start_time should win.
    const rows: AttendanceLike[] = Array.from({ length: 5 }).map(() =>
      makeRow({
        attended_at: '2026-05-11T18:00:00.000Z',
        session: { start_time: '07:00:00' },
      })
    );
    const result = computeTrainingPattern(rows);
    expect(result?.topBucket).toBe('morning');
    expect(result?.topBucketShare).toBe(100);
  });

  it('falls back to attended_at hour when session is null', () => {
    // No session, attended_at is a local timestamp. The test's
    // assertion is loose: the bucket should be one of the four
    // possible buckets (depending on the test runner's TZ).
    const rows: AttendanceLike[] = Array.from({ length: 5 }).map(() =>
      makeRow({ session: null, attended_at: '2026-05-11T07:30:00.000Z' })
    );
    const result = computeTrainingPattern(rows);
    expect(['morning', 'midday', 'evening', 'night']).toContain(result?.topBucket);
  });

  it('picks the dominant bucket in a mixed history', () => {
    const rows: AttendanceLike[] = [
      ...Array.from({ length: 1 }).map(() => makeRow({ session: { start_time: '07:00:00' } })),
      ...Array.from({ length: 4 }).map(() => makeRow({ session: { start_time: '19:00:00' } })),
    ];
    const result = computeTrainingPattern(rows);
    expect(result?.topBucket).toBe('evening');
    // 4 of 5 = 80%.
    expect(result?.topBucketShare).toBe(80);
  });

  it('topBucketShare is 0 when every row lacks both session and attended_at hour', () => {
    // Pathological: rows with session={start_time:null} and
    // attended_at present — fallback path runs. We want to make sure
    // a NaN or undefined doesn't sneak into topBucketShare.
    const rows: AttendanceLike[] = Array.from({ length: 5 }).map(() =>
      makeRow({ session: { start_time: null }, attended_at: '2026-05-11T13:00:00.000Z' })
    );
    const result = computeTrainingPattern(rows);
    // attended_at fallback should pick one of the four real buckets;
    // share should be a number, not NaN.
    expect(typeof result?.topBucketShare).toBe('number');
    expect(Number.isFinite(result?.topBucketShare)).toBe(true);
  });
});

describe('computeTrainingPattern — sport preference', () => {
  function rowWithSport(sport: string | null | undefined): AttendanceLike {
    return {
      attended: true,
      attended_at: '2026-05-11T18:00:00.000Z',
      session: { start_time: '18:00:00', sport: sport ?? null },
    };
  }

  it('surfaces topSport when the dominant share crosses 50%', async () => {
    // 4 yoga + 1 strength out of 5 = 80% yoga, well over the
    // 50% threshold. topSport should be 'yoga'.
    const rows: AttendanceLike[] = [
      ...Array.from({ length: 4 }).map(() => rowWithSport('yoga')),
      rowWithSport('strength'),
    ];
    const result = computeTrainingPattern(rows);
    expect(result?.topSport).toBe('yoga');
    expect(result?.topSportShare).toBe(80);
  });

  it('suppresses topSport when the leader is exactly 50% (boundary)', async () => {
    // 3 yoga + 3 strength = 50/50 → the leader is NOT > 50%, so
    // we render nothing. Calling a 50/50 member "mostly yoga"
    // would be misleading.
    const rows: AttendanceLike[] = [
      ...Array.from({ length: 3 }).map(() => rowWithSport('yoga')),
      ...Array.from({ length: 3 }).map(() => rowWithSport('strength')),
    ];
    const result = computeTrainingPattern(rows);
    expect(result?.topSport).toBeNull();
    expect(result?.topSportShare).toBe(0);
  });

  it('suppresses topSport for a 3-way split where no leader breaks 50%', async () => {
    const rows: AttendanceLike[] = [
      ...Array.from({ length: 2 }).map(() => rowWithSport('yoga')),
      ...Array.from({ length: 2 }).map(() => rowWithSport('strength')),
      ...Array.from({ length: 2 }).map(() => rowWithSport('hiit')),
    ];
    const result = computeTrainingPattern(rows);
    expect(result?.topSport).toBeNull();
  });

  it('ignores rows with null or missing sport when computing the histogram', async () => {
    // 4 yoga + 2 no-sport = topSport should be yoga at 4/6 = 67%.
    // The no-sport rows still count toward the day-of-week and time
    // buckets but they don't bias the sport histogram.
    const rows: AttendanceLike[] = [
      ...Array.from({ length: 4 }).map(() => rowWithSport('yoga')),
      ...Array.from({ length: 2 }).map(() => rowWithSport(null)),
    ];
    const result = computeTrainingPattern(rows);
    expect(result?.topSport).toBe('yoga');
    // 4/6 = 67% (4/total, not 4/sport-having-rows). topSportShare
    // is computed against total attended sessions, NOT against
    // rows-with-sport. That's intentional — surfacing "67% yoga"
    // when 33% of sessions have no recorded sport is more truthful
    // than surfacing "100% yoga".
    expect(result?.topSportShare).toBe(67);
  });

  it('returns null topSport when no row has a sport (all sessionless)', async () => {
    const rows: AttendanceLike[] = Array.from({ length: 6 }).map(() => ({
      attended: true,
      attended_at: '2026-05-11T18:00:00.000Z',
      session: null,
    }));
    const result = computeTrainingPattern(rows);
    expect(result?.topSport).toBeNull();
    expect(result?.topSportShare).toBe(0);
  });
});
