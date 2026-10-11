import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { bogotaToday } from '@/lib/tribe-os/dates';
import { monthlyValueCents, type PlanPrice } from '@/lib/tribe-os/forecast';
import {
  weekBuckets,
  computeWeeklyAttendance,
  computePeakHours,
  computeClassStats,
  computeCoachStats,
  computeContactEffect,
  computeContactSummary28d,
  computeActiveMembers,
  computeVisitChangePct,
  type Visit,
  type Touch,
} from '@/lib/tribe-os/analytics';
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

async function fetchAllVisits(
  supabase: SupabaseClient,
  gymId: string,
  since: string,
): Promise<Visit[]> {
  const all: Visit[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('client_visits')
      .select('client_id, visited_at, class_name, coach_name')
      .eq('gym_id', gymId)
      .gte('visited_at', since + 'T00:00:00Z')
      .order('visited_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Visit[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function fetchAllTouches(
  supabase: SupabaseClient,
  gymId: string,
  since: string,
): Promise<Touch[]> {
  const all: Touch[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('client_touches')
      .select('client_id, created_at')
      .eq('gym_id', gymId)
      .gte('created_at', since + 'T00:00:00Z')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Touch[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function fetchPriorVisitClientIds(
  supabase: SupabaseClient,
  gymId: string,
  before: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('client_visits')
      .select('client_id')
      .eq('gym_id', gymId)
      .lt('visited_at', before + 'T00:00:00Z')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) ids.add(r.client_id);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return ids;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  const weeksParam = request.nextUrl.searchParams.get('weeks');
  const weeks = weeksParam ? Math.min(Math.max(parseInt(weeksParam, 10) || 12, 4), 52) : 12;

  try {
    const today = bogotaToday();
    const buckets = weekBuckets(today, weeks);
    const rangeStart = buckets[0].weekStart;

    const [visits, touches, plansRes, membersRes] = await Promise.all([
      fetchAllVisits(supabase, gymId, rangeStart),
      fetchAllTouches(supabase, gymId, rangeStart),
      supabase
        .from('gym_plans')
        .select('name, price_cents, currency, duration_months')
        .eq('gym_id', gymId),
      supabase
        .from('clients')
        .select('id, membership_plan')
        .eq('gym_id', gymId),
    ]);

    if (plansRes.error) throw plansRes.error;
    if (membersRes.error) throw membersRes.error;

    const gymRes = await supabase.from('gyms').select('default_currency').eq('id', gymId).single();
    const gymCurrency = gymRes.data?.default_currency ?? 'COP';

    const plans: PlanPrice[] = (plansRes.data ?? []).map((p) => ({
      name: p.name as string,
      price_cents: p.price_cents as number,
      currency: p.currency as string,
      duration_months: p.duration_months as number,
    }));

    const planValues = new Map<string, number | null>();
    for (const m of membersRes.data ?? []) {
      planValues.set(m.id, monthlyValueCents(m.membership_plan, plans, gymCurrency));
    }

    const allClientIds = new Set((membersRes.data ?? []).map((m) => m.id));
    const priorClients = await fetchPriorVisitClientIds(supabase, gymId, rangeStart);

    const attendance = computeWeeklyAttendance(visits, buckets);
    const peakHours = computePeakHours(visits);
    const classStats = computeClassStats(visits);
    const coachStats = computeCoachStats(visits);
    const contactEffect = computeContactEffect(touches, visits, planValues, buckets);
    const contactSummary28d = computeContactSummary28d(touches, visits, today);
    const activeMembers = computeActiveMembers(visits, today, allClientIds, priorClients);

    const visitChangePct = computeVisitChangePct(attendance);

    return NextResponse.json({
      success: true,
      data: {
        weeks,
        currency: gymCurrency,
        contact_effect: {
          touches: contactSummary28d.total,
          came_back: contactSummary28d.came_back,
          conversion_pct: contactSummary28d.conversion_pct,
          conversion_label: contactSummary28d.conversion_label,
          recovered_cents: contactEffect.recoveredCentsPerMonth,
          weekly: contactEffect.weeklyTouches,
        },
        attendance: {
          weekly: attendance,
          visit_change_pct: visitChangePct,
          total_visits: visits.length,
          unique_members: new Set(visits.map((v) => v.client_id)).size,
        },
        peak_hours: peakHours,
        classes: classStats.slice(0, 10),
        coaches: coachStats.slice(0, 10),
        active_members: activeMembers,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/analytics' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
