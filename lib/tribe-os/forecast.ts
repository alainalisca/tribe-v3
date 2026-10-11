/**
 * Pure helpers for revenue forecast calculations.
 *
 * Two risk buckets:
 *   - "En riesgo": days 7–30 absent, OR plan expires within 7 days,
 *     OR plan expired within last 7 days. Uses the same 7–30 day window
 *     as the contact filter in Retención.
 *   - "Probablemente perdidos": 30+ days absent. Separate bucket, not
 *     included in Dinero en riesgo.
 *
 * Reasons are the specific retention reasons from client_retention_v2,
 * in the owner's language (ES half of the bilingual string).
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

export interface ForecastMember {
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
  touchedDaysAgo: number | null;
  cameBackAfterTouch: boolean;
}

export interface RecoveredMember {
  id: string;
  name: string | null;
  monthlyValueCents: number | null;
}

export interface ForecastResult {
  monthlyIncomeCents: number;
  atRiskTotalCents: number;
  atRiskMembers: ForecastMember[];
  probablyLostTotalCents: number;
  probablyLostMembers: ForecastMember[];
  recoveredThisMonth: RecoveredMember[];
  recoveredTotalCents: number;
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
  sevenDaysAgo: string,
  twentyEightDaysAgo: string,
): boolean {
  if (m.plan_ends_on && m.plan_ends_on >= sevenDaysAgo) return true;
  if (!m.plan_ends_on && m.last_activity_at) {
    return m.last_activity_at >= twentyEightDaysAgo + 'T00:00:00';
  }
  return false;
}

export function ownerReason(bilingual: string, language: 'en' | 'es'): string {
  const parts = bilingual.split(' / ');
  if (parts.length < 2) return bilingual;
  return language === 'es' ? parts[0] : parts[1];
}

const BOGOTA_MONTHS_ES = [
  'ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.',
  'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.',
];
const BOGOTA_MONTHS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function humanizeReason(
  localized: string,
  lastActivityAt: string | null,
  language: 'en' | 'es',
): string {
  if (!localized.includes('100%')) return localized;
  const is100Es = localized.startsWith('Viene 100% menos');
  const is100En = localized.startsWith('Visiting 100% less');
  if (!is100Es && !is100En) return localized;
  if (!lastActivityAt) {
    return language === 'es' ? 'No ha vuelto' : 'Has not returned';
  }
  const d = new Date(lastActivityAt);
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const day = bogota.getDate();
  const month = language === 'es'
    ? BOGOTA_MONTHS_ES[bogota.getMonth()]
    : BOGOTA_MONTHS_EN[bogota.getMonth()];
  return language === 'es'
    ? `No ha vuelto desde el ${day} de ${month}`
    : `Has not returned since ${month} ${day}`;
}

function buildReasons(m: MemberForForecast, status: string, language: 'en' | 'es'): string[] {
  const out: string[] = [];
  for (const r of m.reasons) {
    const localized = ownerReason(r, language);
    if (localized.includes('Asistencia estable') || localized.includes('Stable attendance')) continue;
    if (localized.includes('Miembro nuevo') || localized.includes('New member')) continue;
    out.push(humanizeReason(localized, m.last_activity_at, language));
  }
  if (out.length === 0) {
    if (status === 'expiring') out.push(language === 'es' ? 'Plan vence pronto' : 'Plan expiring soon');
    else if (status === 'expired') out.push(language === 'es' ? 'Plan vencido' : 'Plan expired');
    else if (m.days_since_last_activity !== null && m.days_since_last_activity > 30) {
      out.push(
        language === 'es'
          ? `${m.days_since_last_activity} días sin venir`
          : `${m.days_since_last_activity} days absent`,
      );
    }
  }
  return out;
}

function sortAtRisk(a: ForecastMember, b: ForecastMember): number {
  const statusOrder: Record<string, number> = { expired: 0, expiring: 1, active: 2, no_plan: 3 };
  const sa = statusOrder[a.planStatus] ?? 3;
  const sb = statusOrder[b.planStatus] ?? 3;
  if (sa !== sb) return sa - sb;
  const ta = a.touchedDaysAgo !== null ? 1 : 0;
  const tb = b.touchedDaysAgo !== null ? 1 : 0;
  if (ta !== tb) return ta - tb;
  const da = a.daysSinceLastActivity ?? 0;
  const db = b.daysSinceLastActivity ?? 0;
  if (da !== db) return db - da;
  return (b.monthlyValueCents ?? 0) - (a.monthlyValueCents ?? 0);
}

export function computeForecast(
  members: MemberForForecast[],
  plans: PlanPrice[],
  gymCurrency: string,
  today: string,
  bogotaMonthStart: string,
  language: 'en' | 'es' = 'es',
): ForecastResult {
  const sevenDaysFromNow = addDaysSimple(today, 7);
  const sevenDaysAgo = addDaysSimple(today, -7);
  const twentyEightDaysAgo = addDaysSimple(today, -28);

  let monthlyIncomeCents = 0;
  let unpricedCount = 0;
  const atRiskMembers: ForecastMember[] = [];
  const probablyLostMembers: ForecastMember[] = [];
  const recoveredThisMonth: RecoveredMember[] = [];
  const seen = new Set<string>();

  for (const m of members) {
    const mv = monthlyValueCents(m.membership_plan, plans, gymCurrency);
    const current = isCurrentMember(m, sevenDaysAgo, twentyEightDaysAgo);

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
    const days = m.days_since_last_activity;

    const isProbablyLost = days !== null && days > 30;
    const isAtRisk =
      !isProbablyLost &&
      current &&
      ((days !== null && days >= 7 && days <= 30) || status === 'expiring' || status === 'expired');

    if (seen.has(m.id)) continue;

    let touchedDaysAgo: number | null = null;
    if (m.last_touch_created_at) {
      const touchMs = new Date(m.last_touch_created_at).getTime();
      const todayMs = new Date(today + 'T12:00:00Z').getTime();
      touchedDaysAgo = Math.round((todayMs - touchMs) / 86_400_000);
    }

    const entry: ForecastMember = {
      id: m.id,
      name: m.name,
      phone: m.phone,
      plan: m.membership_plan,
      monthlyValueCents: mv,
      reasons: buildReasons(m, status, language),
      riskLevel: m.retention_level,
      planStatus: status,
      daysSinceLastActivity: days,
      lastActivityAt: m.last_activity_at,
      lastTouchCreatedAt: m.last_touch_created_at,
      planEndsOn: m.plan_ends_on,
      touchedDaysAgo: touchedDaysAgo !== null && touchedDaysAgo <= 14 ? touchedDaysAgo : null,
      cameBackAfterTouch: m.has_touch_then_visit,
    };

    if (isProbablyLost) {
      seen.add(m.id);
      probablyLostMembers.push(entry);
    } else if (isAtRisk) {
      seen.add(m.id);
      atRiskMembers.push(entry);
    }

    if (m.has_touch_then_visit && m.visit_after_touch_at) {
      const visitDate = m.visit_after_touch_at.slice(0, 10);
      if (visitDate >= bogotaMonthStart && visitDate <= today) {
        recoveredThisMonth.push({ id: m.id, name: m.name, monthlyValueCents: mv });
      }
    }
  }

  atRiskMembers.sort(sortAtRisk);
  probablyLostMembers.sort((a, b) => (b.monthlyValueCents ?? 0) - (a.monthlyValueCents ?? 0));

  return {
    monthlyIncomeCents,
    atRiskTotalCents: atRiskMembers.reduce((sum, m) => sum + (m.monthlyValueCents ?? 0), 0),
    atRiskMembers,
    probablyLostTotalCents: probablyLostMembers.reduce((sum, m) => sum + (m.monthlyValueCents ?? 0), 0),
    probablyLostMembers,
    recoveredThisMonth,
    recoveredTotalCents: recoveredThisMonth.reduce((sum, m) => sum + (m.monthlyValueCents ?? 0), 0),
    unpricedCount,
    currency: gymCurrency,
  };
}

function addDaysSimple(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
