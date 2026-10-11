import { describe, it, expect } from 'vitest';
import { computeContactSummary28d } from './analytics';

function daysAgo(n: number, base = '2026-10-11'): string {
  const d = new Date(base + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

describe('computeContactSummary28d', () => {
  const today = '2026-10-11';

  it('returns zeros when no touches', () => {
    const result = computeContactSummary28d([], [], today);
    expect(result).toEqual({ total: 0, came_back: 0, conversion_pct: 0, conversion_label: null });
  });

  it('counts touch with visit within 14 days as came_back', () => {
    const touches = [{ client_id: 'c1', created_at: daysAgo(10) }];
    const visits = [{ client_id: 'c1', visited_at: daysAgo(5) }];
    const result = computeContactSummary28d(touches, visits, today);
    expect(result.total).toBe(1);
    expect(result.came_back).toBe(1);
    expect(result.conversion_label).toBe('1 de 1');
  });

  it('does not count visit before the touch', () => {
    const touches = [{ client_id: 'c1', created_at: daysAgo(10) }];
    const visits = [{ client_id: 'c1', visited_at: daysAgo(12) }];
    const result = computeContactSummary28d(touches, visits, today);
    expect(result.came_back).toBe(0);
  });

  it('does not count visit > 14 days after touch', () => {
    const touches = [{ client_id: 'c1', created_at: daysAgo(25) }];
    const visits = [{ client_id: 'c1', visited_at: daysAgo(5) }];
    const result = computeContactSummary28d(touches, visits, today);
    expect(result.came_back).toBe(0);
  });

  it('ignores touches older than 28 days', () => {
    const touches = [{ client_id: 'c1', created_at: daysAgo(30) }];
    const visits = [{ client_id: 'c1', visited_at: daysAgo(20) }];
    const result = computeContactSummary28d(touches, visits, today);
    expect(result.total).toBe(0);
  });

  it('shows percentage (no label) when >= 5 contacts', () => {
    const touches = Array.from({ length: 5 }, (_, i) => ({
      client_id: `c${i}`,
      created_at: daysAgo(i + 1),
    }));
    const visits = [
      { client_id: 'c0', visited_at: daysAgo(0) },
      { client_id: 'c1', visited_at: daysAgo(0) },
    ];
    const result = computeContactSummary28d(touches, visits, today);
    expect(result.total).toBe(5);
    expect(result.came_back).toBe(2);
    expect(result.conversion_pct).toBe(40);
    expect(result.conversion_label).toBeNull();
  });

  it('shows "X de Y" label when < 5 contacts', () => {
    const touches = [
      { client_id: 'c1', created_at: daysAgo(5) },
      { client_id: 'c2', created_at: daysAgo(3) },
    ];
    const visits = [{ client_id: 'c1', visited_at: daysAgo(2) }];
    const result = computeContactSummary28d(touches, visits, today);
    expect(result.conversion_label).toBe('1 de 2');
  });
});
