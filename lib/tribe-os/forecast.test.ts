import { describe, it, expect } from 'vitest';
import {
  monthlyValueCents,
  computeForecast,
  type PlanPrice,
  type MemberForForecast,
} from './forecast';

const PLANS: PlanPrice[] = [
  { name: 'Mensual', price_cents: 12000000, currency: 'COP', duration_months: 1 },
  { name: 'Trimestral', price_cents: 30000000, currency: 'COP', duration_months: 3 },
  { name: 'Semestral', price_cents: 54000000, currency: 'COP', duration_months: 6 },
  { name: 'Gold USD', price_cents: 5000, currency: 'USD', duration_months: 1 },
];

function makeMember(overrides: Partial<MemberForForecast> = {}): MemberForForecast {
  return {
    id: 'member-1',
    name: 'Test User',
    phone: '+573001234567',
    membership_plan: 'Mensual',
    plan_ends_on: '2026-10-20',
    retention_level: 'low',
    days_since_last_activity: 2,
    last_activity_at: '2026-10-08T10:00:00Z',
    reasons: [],
    has_touch_then_visit: false,
    visit_after_touch_at: null,
    last_touch_created_at: null,
    ...overrides,
  };
}

describe('monthlyValueCents', () => {
  it('matches plan name case-insensitively', () => {
    expect(monthlyValueCents('mensual', PLANS, 'COP')).toBe(12000000);
    expect(monthlyValueCents('MENSUAL', PLANS, 'COP')).toBe(12000000);
  });

  it('truncates integer division', () => {
    expect(monthlyValueCents('Trimestral', PLANS, 'COP')).toBe(10000000);
  });

  it('returns null when plan name has no match', () => {
    expect(monthlyValueCents('Premium', PLANS, 'COP')).toBeNull();
  });

  it('returns null when plan is null', () => {
    expect(monthlyValueCents(null, PLANS, 'COP')).toBeNull();
  });

  it('returns null when currency mismatches gym default', () => {
    expect(monthlyValueCents('Gold USD', PLANS, 'COP')).toBeNull();
  });

  it('trims whitespace from member plan name', () => {
    expect(monthlyValueCents('  Mensual  ', PLANS, 'COP')).toBe(12000000);
  });
});

describe('computeForecast', () => {
  const TODAY = '2026-10-10';
  const MONTH_START = '2026-10-01';

  it('sums monthly income for current members', () => {
    const members = [
      makeMember({ id: '1', membership_plan: 'Mensual', plan_ends_on: '2026-10-20' }),
      makeMember({ id: '2', membership_plan: 'Trimestral', plan_ends_on: '2026-12-01' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.monthlyIncomeCents).toBe(12000000 + 10000000);
  });

  it('counts unpriced members (plan name with no gym_plan match)', () => {
    const members = [
      makeMember({ id: '1', membership_plan: 'Premium', plan_ends_on: '2026-10-20' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.unpricedCount).toBe(1);
    expect(result.monthlyIncomeCents).toBe(0);
  });

  it('flags high-retention members as at-risk', () => {
    const members = [
      makeMember({ id: '1', retention_level: 'high', plan_ends_on: '2026-10-20' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers).toHaveLength(1);
    expect(result.atRiskMembers[0].reasons).toContain('Riesgo alto de abandono');
  });

  it('flags expiring-plan members as at-risk', () => {
    const members = [
      makeMember({ id: '1', retention_level: 'low', plan_ends_on: '2026-10-15' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers).toHaveLength(1);
    expect(result.atRiskMembers[0].reasons).toContain('Plan vence pronto');
  });

  it('flags recently-expired plan members as at-risk', () => {
    const members = [
      makeMember({ id: '1', retention_level: 'low', plan_ends_on: '2026-10-05' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers).toHaveLength(1);
    expect(result.atRiskMembers[0].reasons).toContain('Plan vencido');
  });

  it('deduplicates at-risk reasons (no double reason for same category)', () => {
    const members = [
      makeMember({ id: '1', retention_level: 'high', plan_ends_on: '2026-10-12' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    const reasons = result.atRiskMembers[0].reasons;
    expect(reasons).toContain('Riesgo alto de abandono');
    expect(reasons).toContain('Plan vence pronto');
    expect(reasons).toHaveLength(2);
  });

  it('sorts at-risk by monthly value descending', () => {
    const members = [
      makeMember({ id: '1', retention_level: 'high', membership_plan: 'Mensual', plan_ends_on: '2026-10-20' }),
      makeMember({ id: '2', retention_level: 'high', membership_plan: 'Semestral', plan_ends_on: '2026-10-20' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers[0].monthlyValueCents).toBe(12000000);
    expect(result.atRiskMembers[1].monthlyValueCents).toBe(9000000);
  });

  it('counts recovered members with visit this calendar month', () => {
    const members = [
      makeMember({
        id: '1',
        has_touch_then_visit: true,
        visit_after_touch_at: '2026-10-08T14:00:00Z',
      }),
      makeMember({
        id: '2',
        has_touch_then_visit: true,
        visit_after_touch_at: '2026-09-28T14:00:00Z',
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.recoveredThisMonth).toHaveLength(1);
    expect(result.recoveredThisMonth[0].id).toBe('1');
  });

  it('excludes members whose plan expired more than 7 days ago', () => {
    const members = [
      makeMember({ id: '1', plan_ends_on: '2026-09-25' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.monthlyIncomeCents).toBe(0);
    expect(result.atRiskMembers).toHaveLength(0);
  });

  it('includes members with no plan but recent activity', () => {
    const members = [
      makeMember({
        id: '1',
        membership_plan: 'Mensual',
        plan_ends_on: null,
        last_activity_at: '2026-09-20T10:00:00Z',
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.monthlyIncomeCents).toBe(12000000);
  });
});
