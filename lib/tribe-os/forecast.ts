/**
 * Pure helpers for revenue forecast calculations.
 *
 * All amounts in cents (bigint-safe integers). Currency must match
 * the gym's default_currency; members whose plan currency differs
 * are excluded and counted via `currencyMismatchCount`.
 */

export interface PlanPrice {
  name: string;
  price_cents: number;
  currency: string;
  duration_months: number;
}

export interface MemberForForecast {
  id: string;
  name: string | null;
  phone: string | null;
  membership_plan: string | null;
  plan_ends_on: string | null;
  retention_level: string | null;
  days_since_last_activity: number | null;
  last_activity_at: string | null;
  reasons: string[];
  has_touch_then_visit: boolean;
  visit_after_touch_at: string | null;
  last_touch_created_at: string | null;
}

export interface AtRiskMember {
  id: string;
  name: string | null;
  phone: string | null;
  plan: string | null;
  monthlyValueCents: number | null;
  reasons: string[];
  riskLevel: string | null;
  planStatus: 'active' | 'expiring' | 'expired' | 'no_plan';
  daysSinceLastActivity: number | null;
  lastActivityAt: string | null;
  lastTouchCreatedAt: string | null;
  planEndsOn: string | null;
}

export interface RecoveredMember {
  id: string;
  name: string | null;
}

export interface ForecastResult {
  monthlyIncomeCents: number;
  atRiskTotalCents: number;
  atRiskMembers: AtRiskMember[];
  recoveredThisMonth: RecoveredMember[];
  unpricedCount: number;
  currency: string;
}

export function monthlyValueCents(
  memberPlan: string | null,
  plans: PlanPrice[],
  gymCurrency: string,
): number | null {
  if (!memberPlan) return null;
  const normalizedMember = memberPlan.trim().toLowerCase();
  const match = plans.find((p) => p.name.trim().toLowerCase() === normalizedMember);
  if (!match) return null;
  if (match.currency !== gymCurrency) return null;
  if (match.duration_months <= 0) return null;
  return Math.floor(match.price_cents / match.duration_months);
}

function planStatus(
  planEndsOn: string | null,
  today: string,
  sevenDaysFromNow: string,
  sevenDaysAgo: string,
): 'active' | 'expiring' | 'expired' | 'no_plan' {
  if (!planEndsOn) return 'no_plan';
  if (planEndsOn < sevenDaysAgo) return 'expired';
  if (planEndsOn < today) return 'expired';
  if (planEndsOn <= sevenDaysFromNow) return 'expiring';
  return 'active';
}

function isCurrentMember(
  m: MemberForForecast,
  today: string,
  sevenDaysAgo: string,
  twentyEightDaysAgo: string,
): boolean {
  if (m.plan_ends_on && m.plan_ends_on >= sevenDaysAgo) return true;
  if (!m.plan_ends_on && m.last_activity_at) {
    return m.last_activity_at >= twentyEightDaysAgo + 'T00:00:00';
  }
  return false;
}

function atRiskReasons(
  m: MemberForForecast,
  status: 'active' | 'expiring' | 'expired' | 'no_plan',
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  if (m.retention_level === 'high' && !seen.has('retention')) {
    out.push('Riesgo alto de abandono');
    seen.add('retention');
  }
  if (m.retention_level === 'medium' && !seen.has('retention')) {
    out.push('Riesgo medio de abandono');
    seen.add('retention');
  }
  if (status === 'expiring' && !seen.has('plan')) {
    out.push('Plan vence pronto');
    seen.add('plan');
  }
  if (status === 'expired' && !seen.has('plan')) {
    out.push('Plan vencido');
    seen.add('plan');
  }
  return out;
}

export function computeForecast(
  members: MemberForForecast[],
  plans: PlanPrice[],
  gymCurrency: string,
  today: string,
  bogotaMonthStart: string,
): ForecastResult {
  const sevenDaysFromNow = addDaysSimple(today, 7);
  const sevenDaysAgo = addDaysSimple(today, -7);
  const twentyEightDaysAgo = addDaysSimple(today, -28);

  let monthlyIncomeCents = 0;
  let unpricedCount = 0;
  const atRiskMembers: AtRiskMember[] = [];
  const recoveredThisMonth: RecoveredMember[] = [];
  const seenAtRisk = new Set<string>();

  for (const m of members) {
    const mv = monthlyValueCents(m.membership_plan, plans, gymCurrency);
    const current = isCurrentMember(m, today, sevenDaysAgo, twentyEightDaysAgo);

    if (current && m.membership_plan && mv === null) {
      const matchExists = plans.some(
        (p) => p.name.trim().toLowerCase() === m.membership_plan!.trim().toLowerCase(),
      );
      if (!matchExists) unpricedCount++;
    }

    if (current && mv !== null) {
      monthlyIncomeCents += mv;
    }

    const status = planStatus(m.plan_ends_on, today, sevenDaysFromNow, sevenDaysAgo);

    const isAtRisk =
      m.retention_level === 'high' ||
      m.retention_level === 'medium' ||
      status === 'expiring' ||
      status === 'expired';

    if (isAtRisk && current && !seenAtRisk.has(m.id)) {
      seenAtRisk.add(m.id);
      const reasons = atRiskReasons(m, status);
      atRiskMembers.push({
        id: m.id,
        name: m.name,
        phone: m.phone,
        plan: m.membership_plan,
        monthlyValueCents: mv,
        reasons,
        riskLevel: m.retention_level,
        planStatus: status,
        daysSinceLastActivity: m.days_since_last_activity,
        lastActivityAt: m.last_activity_at,
        lastTouchCreatedAt: m.last_touch_created_at,
        planEndsOn: m.plan_ends_on,
      });
    }

    if (m.has_touch_then_visit && m.visit_after_touch_at) {
      const visitDate = m.visit_after_touch_at.slice(0, 10);
      if (visitDate >= bogotaMonthStart && visitDate <= today) {
        recoveredThisMonth.push({ id: m.id, name: m.name });
      }
    }
  }

  atRiskMembers.sort((a, b) => (b.monthlyValueCents ?? 0) - (a.monthlyValueCents ?? 0));

  return {
    monthlyIncomeCents,
    atRiskTotalCents: atRiskMembers.reduce((sum, m) => sum + (m.monthlyValueCents ?? 0), 0),
    atRiskMembers,
    recoveredThisMonth,
    unpricedCount,
    currency: gymCurrency,
  };
}

function addDaysSimple(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
