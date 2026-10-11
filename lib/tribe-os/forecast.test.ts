import { describe, it, expect } from 'vitest';
import {
  monthlyValueCents,
  computeForecast,
  ownerReason,
  humanizeReason,
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

describe('ownerReason', () => {
  it('returns ES half for bilingual reason', () => {
    expect(ownerReason('20 días sin venir / 20 days absent', 'es')).toBe('20 días sin venir');
  });

  it('returns EN half for bilingual reason', () => {
    expect(ownerReason('20 días sin venir / 20 days absent', 'en')).toBe('20 days absent');
  });

  it('returns full string if no separator', () => {
    expect(ownerReason('Plan vence pronto', 'es')).toBe('Plan vence pronto');
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

  it('puts 7–30 day absent members in at-risk bucket', () => {
    const members = [
      makeMember({ id: '1', days_since_last_activity: 15, plan_ends_on: '2026-10-20' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers).toHaveLength(1);
    expect(result.probablyLostMembers).toHaveLength(0);
  });

  it('puts 30+ day absent members in probably-lost bucket', () => {
    const members = [
      makeMember({
        id: '1',
        days_since_last_activity: 35,
        last_activity_at: '2026-09-05T10:00:00Z',
        plan_ends_on: null,
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.probablyLostMembers).toHaveLength(1);
    expect(result.atRiskMembers).toHaveLength(0);
    expect(result.atRiskTotalCents).toBe(0);
  });

  it('flags expiring-plan members as at-risk', () => {
    const members = [
      makeMember({ id: '1', retention_level: 'low', days_since_last_activity: 3, plan_ends_on: '2026-10-15' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers).toHaveLength(1);
    expect(result.atRiskMembers[0].planStatus).toBe('expiring');
  });

  it('flags recently-expired plan members as at-risk', () => {
    const members = [
      makeMember({ id: '1', retention_level: 'low', days_since_last_activity: 3, plan_ends_on: '2026-10-05' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers).toHaveLength(1);
    expect(result.atRiskMembers[0].planStatus).toBe('expired');
  });

  it('uses specific retention reasons instead of generic labels', () => {
    const members = [
      makeMember({
        id: '1',
        days_since_last_activity: 15,
        retention_level: 'high',
        reasons: ['15 días sin venir / 15 days absent', 'Viene 40% menos que su promedio / Visiting 40% less than average'],
        plan_ends_on: '2026-10-20',
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    const reasons = result.atRiskMembers[0].reasons;
    expect(reasons).toContain('15 días sin venir');
    expect(reasons).toContain('Viene 40% menos que su promedio');
    expect(reasons.some((r) => r.includes('Riesgo alto'))).toBe(false);
  });

  it('sorts at-risk: plan expired/expiring first, then days absent desc, then value desc', () => {
    const members = [
      makeMember({ id: 'a', days_since_last_activity: 10, membership_plan: 'Semestral', plan_ends_on: '2026-10-20', reasons: ['10 días sin venir / 10 days absent'] }),
      makeMember({ id: 'b', days_since_last_activity: 3, plan_ends_on: '2026-10-08', reasons: ['Su plan venció hace 2 días / Plan expired 2 days ago'] }),
      makeMember({ id: 'c', days_since_last_activity: 20, membership_plan: 'Mensual', plan_ends_on: '2026-10-20', reasons: ['20 días sin venir / 20 days absent'] }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('counts recovered members with visit this calendar month and includes monthly value', () => {
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
    expect(result.recoveredThisMonth[0].monthlyValueCents).toBe(12000000);
    expect(result.recoveredTotalCents).toBe(12000000);
  });

  it('excludes members whose plan expired more than 7 days ago from at-risk', () => {
    const members = [
      makeMember({ id: '1', days_since_last_activity: 5, plan_ends_on: '2026-09-25' }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
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

  it('replaces "Viene 100% menos" with "No ha vuelto desde el..." in reasons', () => {
    const members = [
      makeMember({
        id: '1',
        days_since_last_activity: 15,
        last_activity_at: '2026-09-25T14:00:00Z',
        reasons: ['Viene 100% menos que su promedio / Visiting 100% less than average'],
        plan_ends_on: '2026-10-20',
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers[0].reasons[0]).toMatch(/No ha vuelto desde el 25 de sep\./);
  });

  it('keeps "Viene X% menos" when X < 100', () => {
    const members = [
      makeMember({
        id: '1',
        days_since_last_activity: 15,
        reasons: ['Viene 60% menos que su promedio / Visiting 60% less than average'],
        plan_ends_on: '2026-10-20',
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers[0].reasons[0]).toBe('Viene 60% menos que su promedio');
  });

  it('sorts touched members after untouched members at same urgency', () => {
    const members = [
      makeMember({
        id: 'touched',
        days_since_last_activity: 20,
        last_touch_created_at: '2026-10-05T10:00:00Z',
        membership_plan: 'Mensual',
        plan_ends_on: '2026-10-20',
        reasons: ['20 días sin venir / 20 days absent'],
      }),
      makeMember({
        id: 'untouched',
        days_since_last_activity: 20,
        last_touch_created_at: null,
        membership_plan: 'Mensual',
        plan_ends_on: '2026-10-20',
        reasons: ['20 días sin venir / 20 days absent'],
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers.map((m) => m.id)).toEqual(['untouched', 'touched']);
  });

  it('sets touchedDaysAgo only for touches within 14 days', () => {
    const members = [
      makeMember({
        id: 'recent-touch',
        days_since_last_activity: 15,
        last_touch_created_at: '2026-10-05T10:00:00Z',
        plan_ends_on: '2026-10-20',
        reasons: ['15 días sin venir / 15 days absent'],
      }),
      makeMember({
        id: 'old-touch',
        days_since_last_activity: 15,
        last_touch_created_at: '2026-09-20T10:00:00Z',
        plan_ends_on: '2026-10-20',
        reasons: ['15 días sin venir / 15 days absent'],
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    const recent = result.atRiskMembers.find((m) => m.id === 'recent-touch');
    const old = result.atRiskMembers.find((m) => m.id === 'old-touch');
    expect(recent?.touchedDaysAgo).toBe(5);
    expect(old?.touchedDaysAgo).toBeNull();
  });

  it('sets cameBackAfterTouch from has_touch_then_visit', () => {
    const members = [
      makeMember({
        id: '1',
        days_since_last_activity: 10,
        last_touch_created_at: '2026-10-03T10:00:00Z',
        has_touch_then_visit: true,
        visit_after_touch_at: '2026-10-06T10:00:00Z',
        plan_ends_on: '2026-10-20',
        reasons: ['10 días sin venir / 10 days absent'],
      }),
    ];
    const result = computeForecast(members, PLANS, 'COP', TODAY, MONTH_START);
    expect(result.atRiskMembers[0].cameBackAfterTouch).toBe(true);
  });
});

describe('humanizeReason', () => {
  it('replaces "Viene 100% menos" with last activity date (ES)', () => {
    const result = humanizeReason(
      'Viene 100% menos que su promedio',
      '2026-09-15T14:00:00Z',
      'es',
    );
    expect(result).toBe('No ha vuelto desde el 15 de sep.');
  });

  it('replaces "Visiting 100% less" with last activity date (EN)', () => {
    const result = humanizeReason(
      'Visiting 100% less than average',
      '2026-09-15T14:00:00Z',
      'en',
    );
    expect(result).toBe('Has not returned since Sep 15');
  });

  it('returns "No ha vuelto" when lastActivityAt is null', () => {
    expect(humanizeReason('Viene 100% menos que su promedio', null, 'es')).toBe('No ha vuelto');
  });

  it('passes through reasons that are not 100%', () => {
    const reason = 'Viene 60% menos que su promedio';
    expect(humanizeReason(reason, '2026-09-15T14:00:00Z', 'es')).toBe(reason);
  });

  it('passes through reasons without a percentage', () => {
    const reason = '15 días sin venir';
    expect(humanizeReason(reason, '2026-09-15T14:00:00Z', 'es')).toBe(reason);
  });
});
