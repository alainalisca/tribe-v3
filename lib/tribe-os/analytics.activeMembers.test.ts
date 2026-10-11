import { describe, it, expect } from 'vitest';
import { computeActiveMembers, type Visit } from './analytics';

const TODAY = '2026-10-11';

function visit(clientId: string, date: string): Visit {
  return { client_id: clientId, visited_at: date + 'T14:00:00Z', class_name: null, coach_name: null };
}

describe('computeActiveMembers', () => {
  it('counts a member as new when first-ever visit is within 28 days', () => {
    const visits: Visit[] = [visit('c1', '2026-10-05')];
    const allClientIds = new Set(['c1']);
    const priorClients = new Set<string>();
    const result = computeActiveMembers(visits, TODAY, allClientIds, priorClients);
    expect(result.newThisPeriod).toBe(1);
    expect(result.returningThisPeriod).toBe(0);
  });

  it('counts a member as returning when they have a visit before the 28-day window', () => {
    const visits: Visit[] = [visit('c1', '2026-10-05')];
    const allClientIds = new Set(['c1']);
    const priorClients = new Set(['c1']);
    const result = computeActiveMembers(visits, TODAY, allClientIds, priorClients);
    expect(result.newThisPeriod).toBe(0);
    expect(result.returningThisPeriod).toBe(1);
  });

  it('does not count inactive members (no visit in last 28 days)', () => {
    const visits: Visit[] = [visit('c1', '2026-08-01')];
    const allClientIds = new Set(['c1']);
    const priorClients = new Set(['c1']);
    const result = computeActiveMembers(visits, TODAY, allClientIds, priorClients);
    expect(result.currentActive).toBe(0);
    expect(result.newThisPeriod).toBe(0);
    expect(result.returningThisPeriod).toBe(0);
  });

  it('handles mix of new and returning', () => {
    const visits: Visit[] = [
      visit('new1', '2026-10-01'),
      visit('ret1', '2026-10-03'),
      visit('ret2', '2026-10-08'),
    ];
    const allClientIds = new Set(['new1', 'ret1', 'ret2']);
    const priorClients = new Set(['ret1', 'ret2']);
    const result = computeActiveMembers(visits, TODAY, allClientIds, priorClients);
    expect(result.currentActive).toBe(3);
    expect(result.newThisPeriod).toBe(1);
    expect(result.returningThisPeriod).toBe(2);
  });
});
