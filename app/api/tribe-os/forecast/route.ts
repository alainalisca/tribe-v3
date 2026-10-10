/**
 * GET /api/tribe-os/forecast
 *
 * Read-only revenue forecast for the caller's gym.
 * All dates in America/Bogota.
 */

import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym } from '@/lib/dal/gyms';
import { bogotaToday } from '@/lib/tribe-os/dates';
import {
  computeForecast,
  type MemberForForecast,
  type PlanPrice,
  type ForecastMember,
} from '@/lib/tribe-os/forecast';

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const today = bogotaToday();
    const monthStart = today.slice(0, 8) + '01';
    const thirtyDaysAgo = addDaysIso(today, -30);

    const [gymRes, plansRes, membersRes, scoresRes, touchesRes, visitsRes] = await Promise.all([
      getGym(supabase, gymId),
      supabase
        .from('gym_plans')
        .select('name, price_cents, currency, duration_months')
        .eq('gym_id', gymId),
      supabase
        .from('clients')
        .select('id, name, phone, membership_plan, plan_ends_on')
        .eq('gym_id', gymId),
      supabase
        .from('client_retention_v2')
        .select('client_id, level, reasons, signals, computed_at')
        .eq('gym_id', gymId),
      supabase
        .from('client_touches')
        .select('client_id, created_at')
        .eq('gym_id', gymId)
        .gte('created_at', thirtyDaysAgo + 'T00:00:00Z')
        .order('created_at', { ascending: false }),
      supabase
        .from('client_visits')
        .select('client_id, visited_at')
        .eq('gym_id', gymId)
        .gte('visited_at', thirtyDaysAgo + 'T00:00:00Z')
        .order('visited_at', { ascending: false }),
    ]);

    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'gym_not_found' }, { status: 404 });
    }
    if (plansRes.error) throw plansRes.error;
    if (membersRes.error) throw membersRes.error;
    if (scoresRes.error) throw scoresRes.error;

    const gymCurrency = gymRes.data.default_currency ?? 'COP';
    const plans: PlanPrice[] = (plansRes.data ?? []).map((p) => ({
      name: p.name as string,
      price_cents: p.price_cents as number,
      currency: p.currency as string,
      duration_months: p.duration_months as number,
    }));

    const scoreMap = new Map(
      (scoresRes.data ?? []).map((s) => [s.client_id, s]),
    );

    const latestTouchMap = new Map<string, string>();
    for (const t of touchesRes.data ?? []) {
      if (!latestTouchMap.has(t.client_id)) {
        latestTouchMap.set(t.client_id, t.created_at);
      }
    }

    const latestVisitAfterTouchMap = new Map<string, string>();
    const latestVisitMap = new Map<string, string>();
    for (const v of visitsRes.data ?? []) {
      if (!latestVisitMap.has(v.client_id)) {
        latestVisitMap.set(v.client_id, v.visited_at);
      }
    }
    for (const v of visitsRes.data ?? []) {
      const touchAt = latestTouchMap.get(v.client_id);
      if (touchAt && v.visited_at > touchAt) {
        if (!latestVisitAfterTouchMap.has(v.client_id)) {
          latestVisitAfterTouchMap.set(v.client_id, v.visited_at);
        }
      }
    }

    const members: MemberForForecast[] = (membersRes.data ?? []).map((m) => {
      const s = scoreMap.get(m.id);
      const days = s?.signals?.days_since_last_activity ?? null;
      let lastActivityAt: string | null = s?.signals?.last_activity_at ?? null;
      const visit = latestVisitMap.get(m.id);
      if (visit && (!lastActivityAt || visit > lastActivityAt)) {
        lastActivityAt = visit;
      }

      const touchAt = latestTouchMap.get(m.id) ?? null;
      const visitAfterTouch = latestVisitAfterTouchMap.get(m.id) ?? null;

      return {
        id: m.id,
        name: m.name ?? null,
        phone: m.phone ?? null,
        membership_plan: (m.membership_plan as string | null) ?? null,
        plan_ends_on: (m.plan_ends_on as string | null) ?? null,
        retention_level: s?.level ?? null,
        days_since_last_activity: days,
        last_activity_at: lastActivityAt,
        reasons: s?.reasons ?? [],
        has_touch_then_visit: !!visitAfterTouch,
        visit_after_touch_at: visitAfterTouch,
        last_touch_created_at: touchAt,
      };
    });

    const result = computeForecast(members, plans, gymCurrency, today, monthStart);

    function serializeMember(m: ForecastMember) {
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        plan: m.plan,
        monthly_value: m.monthlyValueCents,
        reasons: m.reasons,
        risk_level: m.riskLevel,
        plan_status: m.planStatus,
        days_since_last_activity: m.daysSinceLastActivity,
        last_activity_at: m.lastActivityAt,
        last_touch_created_at: m.lastTouchCreatedAt,
        plan_ends_on: m.planEndsOn,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        monthly_income: result.monthlyIncomeCents,
        at_risk_total: result.atRiskTotalCents,
        at_risk_count: result.atRiskMembers.length,
        at_risk: result.atRiskMembers.map(serializeMember),
        probably_lost_total: result.probablyLostTotalCents,
        probably_lost_count: result.probablyLostMembers.length,
        probably_lost: result.probablyLostMembers.map(serializeMember),
        recovered_count: result.recoveredThisMonth.length,
        recovered_total: result.recoveredTotalCents,
        recovered: result.recoveredThisMonth,
        unpriced_count: result.unpricedCount,
        currency: result.currency,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/forecast' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

function addDaysIso(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
