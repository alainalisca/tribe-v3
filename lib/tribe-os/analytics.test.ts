import { describe, it, expect } from 'vitest';
import {
  toBogotaDate,
  toBogotaHour,
  weekBuckets,
  dateToWeekStart,
  computeWeeklyAttendance,
  computeContactEffect,
  computeClassStats,
  computeCoachStats,
  computeActiveMembers,
  computePeakHours,
  stripCoachPrefix,
  niceAxisTicks,
  computeVisitChangePct,
  type Visit,
  type Touch,
  type WeeklyAttendance,
} from './analytics';

function makeVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    client_id: 'c1',
    visited_at: '2026-10-05T14:00:00Z',
    class_name: 'CrossFit',
    coach_name: 'Leo',
    ...overrides,
  };
}

function makeTouch(overrides: Partial<Touch> = {}): Touch {
  return {
    client_id: 'c1',
    created_at: '2026-10-01T14:00:00Z',
    ...overrides,
  };
}

describe('toBogotaDate', () => {
  it('converts UTC timestamp to Bogota date', () => {
    expect(toBogotaDate('2026-10-10T04:30:00Z')).toBe('2026-10-09');
  });

  it('handles midday UTC as same Bogota date', () => {
    expect(toBogotaDate('2026-10-10T14:00:00Z')).toBe('2026-10-10');
  });
});

describe('toBogotaHour', () => {
  it('converts UTC to Bogota hour (UTC-5)', () => {
    expect(toBogotaHour('2026-10-10T15:00:00Z')).toBe(10);
  });
});

describe('weekBuckets', () => {
  it('returns correct number of week buckets', () => {
    const buckets = weekBuckets('2026-10-10', 4);
    expect(buckets).toHaveLength(4);
  });

  it('week starts are Mondays', () => {
    const buckets = weekBuckets('2026-10-10', 4);
    for (const b of buckets) {
      const d = new Date(b.weekStart + 'T12:00:00Z');
      expect(d.getUTCDay()).toBe(1);
    }
  });

  it('labels are formatted as "d mes"', () => {
    const buckets = weekBuckets('2026-10-10', 2);
    expect(buckets[0].label).toMatch(/^\d+ [a-záéíóú]+$/);
  });
});

describe('dateToWeekStart', () => {
  it('maps a date to its week bucket', () => {
    const buckets = weekBuckets('2026-10-10', 4);
    const ws = dateToWeekStart('2026-10-08', buckets);
    expect(ws).toBe(buckets[buckets.length - 1].weekStart);
  });

  it('returns null for dates before all buckets', () => {
    const buckets = weekBuckets('2026-10-10', 4);
    expect(dateToWeekStart('2020-01-01', buckets)).toBeNull();
  });
});

describe('computeWeeklyAttendance', () => {
  it('counts total visits and unique members per week', () => {
    const buckets = weekBuckets('2026-10-10', 2);
    const visits: Visit[] = [
      makeVisit({ client_id: 'c1', visited_at: '2026-10-08T14:00:00Z' }),
      makeVisit({ client_id: 'c1', visited_at: '2026-10-08T16:00:00Z' }),
      makeVisit({ client_id: 'c2', visited_at: '2026-10-09T14:00:00Z' }),
    ];
    const result = computeWeeklyAttendance(visits, buckets);
    const lastWeek = result[result.length - 1];
    expect(lastWeek.totalVisits).toBe(3);
    expect(lastWeek.uniqueMembers).toBe(2);
  });

  it('counts same member on same day as one unique member', () => {
    const buckets = weekBuckets('2026-10-10', 2);
    const visits: Visit[] = [
      makeVisit({ client_id: 'c1', visited_at: '2026-10-08T10:00:00Z' }),
      makeVisit({ client_id: 'c1', visited_at: '2026-10-08T18:00:00Z' }),
    ];
    const result = computeWeeklyAttendance(visits, buckets);
    const lastWeek = result[result.length - 1];
    expect(lastWeek.uniqueMembers).toBe(1);
    expect(lastWeek.totalVisits).toBe(2);
  });
});

describe('computeContactEffect', () => {
  const buckets = weekBuckets('2026-10-10', 4);
  const planValues = new Map<string, number | null>([
    ['c1', 12000000],
    ['c2', 10000000],
  ]);

  it('counts touches and came-back within 14 days', () => {
    const touches: Touch[] = [makeTouch({ client_id: 'c1', created_at: '2026-10-01T12:00:00Z' })];
    const visits: Visit[] = [makeVisit({ client_id: 'c1', visited_at: '2026-10-05T14:00:00Z' })];
    const result = computeContactEffect(touches, visits, planValues, buckets);
    expect(result.touchesInRange).toBe(1);
    expect(result.cameBackCount).toBe(1);
    expect(result.conversionPct).toBe(100);
    expect(result.recoveredCentsPerMonth).toBe(12000000);
  });

  it('does not count visits more than 14 days after touch', () => {
    const touches: Touch[] = [makeTouch({ client_id: 'c1', created_at: '2026-09-15T12:00:00Z' })];
    const visits: Visit[] = [makeVisit({ client_id: 'c1', visited_at: '2026-10-05T14:00:00Z' })];
    const result = computeContactEffect(touches, visits, planValues, buckets);
    expect(result.cameBackCount).toBe(0);
  });

  it('does not count visits before the touch', () => {
    const touches: Touch[] = [makeTouch({ client_id: 'c1', created_at: '2026-10-06T12:00:00Z' })];
    const visits: Visit[] = [makeVisit({ client_id: 'c1', visited_at: '2026-10-05T14:00:00Z' })];
    const result = computeContactEffect(touches, visits, planValues, buckets);
    expect(result.cameBackCount).toBe(0);
  });

  it('computes conversion percentage correctly', () => {
    const touches: Touch[] = [
      makeTouch({ client_id: 'c1', created_at: '2026-10-01T12:00:00Z' }),
      makeTouch({ client_id: 'c2', created_at: '2026-10-01T12:00:00Z' }),
    ];
    const visits: Visit[] = [makeVisit({ client_id: 'c1', visited_at: '2026-10-05T14:00:00Z' })];
    const result = computeContactEffect(touches, visits, planValues, buckets);
    expect(result.conversionPct).toBe(50);
    expect(result.recoveredCentsPerMonth).toBe(12000000);
  });
});

describe('computeClassStats', () => {
  it('aggregates visits and unique members per class', () => {
    const visits: Visit[] = [
      makeVisit({ client_id: 'c1', class_name: 'CrossFit' }),
      makeVisit({ client_id: 'c1', class_name: 'CrossFit' }),
      makeVisit({ client_id: 'c2', class_name: 'Yoga' }),
    ];
    const result = computeClassStats(visits);
    expect(result[0].className).toBe('CrossFit');
    expect(result[0].visits).toBe(2);
    expect(result[0].uniqueMembers).toBe(1);
    expect(result[1].className).toBe('Yoga');
    expect(result[1].uniqueMembers).toBe(1);
  });
});

describe('computeCoachStats', () => {
  it('aggregates by coach name', () => {
    const visits: Visit[] = [
      makeVisit({ client_id: 'c1', coach_name: 'Leo' }),
      makeVisit({ client_id: 'c2', coach_name: 'Leo' }),
      makeVisit({ client_id: 'c3', coach_name: 'Ana' }),
    ];
    const result = computeCoachStats(visits);
    expect(result[0].coachName).toBe('Leo');
    expect(result[0].visits).toBe(2);
    expect(result[0].uniqueMembers).toBe(2);
  });
});

describe('computePeakHours', () => {
  it('groups visits by day-of-week and hour', () => {
    const visits: Visit[] = [
      makeVisit({ visited_at: '2026-10-05T15:00:00Z' }),
      makeVisit({ visited_at: '2026-10-05T15:30:00Z' }),
    ];
    const result = computePeakHours(visits);
    const cell = result.find((c) => c.hour === 10);
    expect(cell?.count).toBe(2);
  });
});

describe('computeActiveMembers', () => {
  it('counts members with visits in the last 28 days', () => {
    const visits: Visit[] = [
      makeVisit({ client_id: 'c1', visited_at: '2026-10-08T14:00:00Z' }),
      makeVisit({ client_id: 'c2', visited_at: '2026-09-01T14:00:00Z' }),
    ];
    const allIds = new Set(['c1', 'c2']);
    const priorIds = new Set(['c1']);
    const result = computeActiveMembers(visits, '2026-10-10', allIds, priorIds);
    expect(result.currentActive).toBe(1);
    expect(result.returningThisPeriod).toBe(1);
    expect(result.newThisPeriod).toBe(0);
  });

  it('distinguishes new vs returning', () => {
    const visits: Visit[] = [
      makeVisit({ client_id: 'new1', visited_at: '2026-10-08T14:00:00Z' }),
    ];
    const allIds = new Set(['new1']);
    const priorIds = new Set<string>();
    const result = computeActiveMembers(visits, '2026-10-10', allIds, priorIds);
    expect(result.newThisPeriod).toBe(1);
    expect(result.returningThisPeriod).toBe(0);
  });
});

describe('stripCoachPrefix', () => {
  it('strips "Coach " prefix', () => {
    expect(stripCoachPrefix('Coach Leo')).toBe('Leo');
  });

  it('strips "Profe " prefix', () => {
    expect(stripCoachPrefix('Profe Ana')).toBe('Ana');
  });

  it('strips case-insensitively', () => {
    expect(stripCoachPrefix('coach María')).toBe('María');
  });

  it('returns name unchanged without prefix', () => {
    expect(stripCoachPrefix('Leo')).toBe('Leo');
  });

  it('returns "Sin coach asignado" for null', () => {
    expect(stripCoachPrefix(null)).toBe('Sin coach asignado');
  });
});

describe('computeCoachStats with prefixes and null', () => {
  it('strips prefixes and sorts null coach last', () => {
    const visits: Visit[] = [
      makeVisit({ client_id: 'c1', coach_name: 'Coach Leo' }),
      makeVisit({ client_id: 'c2', coach_name: 'Profe Ana' }),
      makeVisit({ client_id: 'c3', coach_name: null }),
    ];
    const result = computeCoachStats(visits);
    expect(result[0].coachName).toBe('Leo');
    expect(result[1].coachName).toBe('Ana');
    expect(result[result.length - 1].coachName).toBe('Sin coach asignado');
  });
});

describe('niceAxisTicks', () => {
  it('returns [0] for zero max', () => {
    expect(niceAxisTicks(0)).toEqual([0]);
  });

  it('produces ascending ticks for typical attendance', () => {
    const ticks = niceAxisTicks(170);
    expect(ticks).toEqual([0, 50, 100, 150, 200]);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it('covers the max value', () => {
    const ticks = niceAxisTicks(155);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(155);
  });

  it('handles small counts', () => {
    const ticks = niceAxisTicks(3);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });
});

describe('computeVisitChangePct', () => {
  it('excludes last (partial) week from comparison', () => {
    const attendance: WeeklyAttendance[] = [
      { weekStart: 'w1', label: 'w1', totalVisits: 100, uniqueMembers: 50 },
      { weekStart: 'w2', label: 'w2', totalVisits: 120, uniqueMembers: 55 },
      { weekStart: 'w3', label: 'w3', totalVisits: 110, uniqueMembers: 52 },
      { weekStart: 'w4', label: 'w4', totalVisits: 30, uniqueMembers: 20 },
    ];
    const pct = computeVisitChangePct(attendance);
    // completed = [w1(100), w2(120), w3(110)], mid=1
    // prev = [w1] = 100, current = [w2, w3] = 230
    expect(pct).toBe(130);
  });

  it('returns null with fewer than 3 weeks', () => {
    const attendance: WeeklyAttendance[] = [
      { weekStart: 'w1', label: 'w1', totalVisits: 100, uniqueMembers: 50 },
      { weekStart: 'w2', label: 'w2', totalVisits: 30, uniqueMembers: 20 },
    ];
    expect(computeVisitChangePct(attendance)).toBeNull();
  });
});

describe('computeContactEffect edge cases', () => {
  const buckets = weekBuckets('2026-10-10', 4);
  const planValues = new Map<string, number | null>([['c1', 12000000]]);

  it('returns zero touches when no touches provided', () => {
    const result = computeContactEffect([], [], planValues, buckets);
    expect(result.touchesInRange).toBe(0);
    expect(result.cameBackCount).toBe(0);
    expect(result.weeklyTouches.every((w) => w.touches === 0)).toBe(true);
  });

  it('returns correct counts with 1–4 touches', () => {
    const touches: Touch[] = [
      makeTouch({ client_id: 'c1', created_at: '2026-10-01T12:00:00Z' }),
      makeTouch({ client_id: 'c2', created_at: '2026-10-02T12:00:00Z' }),
    ];
    const visits: Visit[] = [makeVisit({ client_id: 'c1', visited_at: '2026-10-05T14:00:00Z' })];
    const result = computeContactEffect(touches, visits, planValues, buckets);
    expect(result.touchesInRange).toBe(2);
    expect(result.cameBackCount).toBe(1);
  });
});

describe('pagination safety', () => {
  it('computeWeeklyAttendance handles >1000 visits correctly', () => {
    const buckets = weekBuckets('2026-10-10', 4);
    const visits: Visit[] = [];
    for (let i = 0; i < 2500; i++) {
      visits.push(
        makeVisit({
          client_id: `c${i % 200}`,
          visited_at: `2026-10-0${(i % 7) + 1}T${String(6 + (i % 12)).padStart(2, '0')}:00:00Z`,
        }),
      );
    }
    const result = computeWeeklyAttendance(visits, buckets);
    const total = result.reduce((s, w) => s + w.totalVisits, 0);
    expect(total).toBe(2500);
  });
});
