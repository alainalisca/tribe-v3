import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { bogotaToday, planExpiryLabelBi } from '@/lib/tribe-os/dates';
import { monthlyValueCents, type PlanPrice } from '@/lib/tribe-os/forecast';
import {
  weekNAgo,
  isInWeek,
  pctChange,
  toBogotaDate,
  findReturnVisitDate,
  toBogotaWeekdayAndHour,
  type ClassSlot,
} from '@/lib/tribe-os/weekly/helpers';
import {
  computeTouchOutcome,
  type TouchRow,
  type VisitRow,
} from '@/lib/tribe-os/touch-outcome';
import { filterContactToday, type ContactFilterRow } from '@/lib/tribe-os/contactFilter';
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

async function fetchAllFrom<T>(
  supabase: SupabaseClient,
  table: string,
  gymId: string,
  select: string,
  since: string,
  dateCol: string,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('gym_id', gymId)
      .gte(dateCol, since + 'T00:00:00Z')
      .order(dateCol, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function fetchFirstVisitBefore(
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

interface TouchWithClient extends TouchRow {
  client_id: string;
  channel: string;
  clients: { name: string | null } | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const weekOffset = Math.min(Math.max(parseInt(params.get('week') ?? '0', 10), 0), 7);

  try {
    const today = bogotaToday();
    const week = weekNAgo(today, weekOffset);
    const prevWeek = weekNAgo(today, weekOffset + 1);
    const fourWeeksAgo = weekNAgo(today, weekOffset + 3);
    const rangeStart = fourWeeksAgo.monday;

    const [visits, touches, touchesWithClients, plansRes, membersRes, scoresRes] = await Promise.all([
      fetchAllFrom<VisitRow & { class_name: string | null; coach_name: string | null }>(
        supabase, 'client_visits', gymId, 'client_id, visited_at, class_name, coach_name', rangeStart, 'visited_at',
      ),
      fetchAllFrom<TouchRow>(
        supabase, 'client_touches', gymId, 'id, client_id, created_at', rangeStart, 'created_at',
      ),
      fetchAllFrom<TouchWithClient>(
        supabase, 'client_touches', gymId, 'id, client_id, channel, created_at, clients(name)', rangeStart, 'created_at',
      ),
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
    ]);

    if (plansRes.error) throw plansRes.error;
    if (membersRes.error) throw membersRes.error;
    if (scoresRes.error) throw scoresRes.error;

    const gymRes = await supabase.from('gyms').select('default_currency').eq('id', gymId).single();
    const gymCurrency = gymRes.data?.default_currency ?? 'COP';

    const plans: PlanPrice[] = (plansRes.data ?? []).map((p) => ({
      name: p.name as string,
      price_cents: p.price_cents as number,
      currency: p.currency as string,
      duration_months: p.duration_months as number,
    }));

    const planValueMap = new Map<string, number | null>();
    for (const m of membersRes.data ?? []) {
      planValueMap.set(m.id, monthlyValueCents(m.membership_plan, plans, gymCurrency));
    }

    const weekVisits = visits.filter((v) => isInWeek(v.visited_at, week));
    const prevVisits = visits.filter((v) => isInWeek(v.visited_at, prevWeek));
    const weekTouches = touches.filter((t) => isInWeek(t.created_at, week));
    const prevTouches = touches.filter((t) => isInWeek(t.created_at, prevWeek));

    const uniqueVisitors = new Set(weekVisits.map((v) => v.client_id));
    const prevUniqueVisitors = new Set(prevVisits.map((v) => v.client_id));

    const existedBefore = await fetchFirstVisitBefore(supabase, gymId, week.monday);
    const newMembers = [...uniqueVisitors].filter((id) => !existedBefore.has(id)).length;
    const prevExistedBefore = await fetchFirstVisitBefore(supabase, gymId, prevWeek.monday);
    const prevNewMembers = [...prevUniqueVisitors].filter((id) => !prevExistedBefore.has(id)).length;

    // Came-back attribution: attribute to the week of the RETURN VISIT, not the touch.
    const now = new Date();
    const allTouchOutcomes = touches.map((t) => ({
      ...t,
      outcome: computeTouchOutcome(t, visits, now),
    }));

    const cameBackInWeek = allTouchOutcomes
      .filter((t) => t.outcome.kind === 'came_back')
      .filter((t) => {
        const returnDate = findReturnVisitDate(t, visits);
        return returnDate !== null && isInWeek(returnDate, week);
      });

    const cameBackCount = cameBackInWeek.length;
    const cameBackClientIds = new Set(cameBackInWeek.map((t) => t.client_id));

    let recoveredCents = 0;
    for (const id of cameBackClientIds) {
      recoveredCents += planValueMap.get(id) ?? 0;
    }

    const atRiskCents = (membersRes.data ?? []).reduce((sum, m) => {
      const score = (scoresRes.data ?? []).find((s) => s.client_id === m.id);
      const days = score?.signals?.days_since_last_activity ?? null;
      if (days !== null && days >= 7 && days <= 30) {
        return sum + (planValueMap.get(m.id) ?? 0);
      }
      return sum;
    }, 0);

    const cameBackMembers = cameBackInWeek.map((t) => {
      const twc = touchesWithClients.find((tc) => tc.id === t.id);
      const clientObj = twc?.clients;
      const returnDate = findReturnVisitDate(t, visits);
      const touchMs = new Date(t.created_at).getTime();
      const returnMs = returnDate ? new Date(returnDate).getTime() : touchMs;
      const days = Math.ceil((returnMs - touchMs) / (24 * 60 * 60 * 1000));
      return {
        id: t.client_id,
        name: clientObj?.name ?? null,
        channel: twc?.channel ?? 'other',
        days,
        monthlyValueCents: planValueMap.get(t.client_id) ?? null,
      };
    });

    const scoreMap = new Map(
      (scoresRes.data ?? []).map((s) => [s.client_id, s]),
    );
    const latestTouchMap = new Map<string, { created_at: string }>();
    for (const t of touches) {
      if (!latestTouchMap.has(t.client_id)) {
        latestTouchMap.set(t.client_id, { created_at: t.created_at });
      }
    }

    const contactRows: (ContactFilterRow & {
      name: string | null;
      phone: string | null;
      membership_plan: string | null;
      reasons: string[];
      days_since_last_activity: number | null;
      monthlyValueCents: number | null;
    })[] = (membersRes.data ?? []).map((m) => {
      const s = scoreMap.get(m.id);
      const days = s?.signals?.days_since_last_activity ?? null;
      return {
        id: m.id,
        name: m.name ?? null,
        phone: m.phone ?? null,
        membership_plan: m.membership_plan ?? null,
        level: s?.level ?? null,
        score: s?.signals?.score ?? null,
        days_since_last_activity: days,
        last_touch: latestTouchMap.get(m.id) ?? null,
        reasons: s?.reasons ?? [],
        monthlyValueCents: planValueMap.get(m.id) ?? null,
      };
    });

    const toContact = filterContactToday(contactRows)
      .sort((a, b) => {
        const da = a.days_since_last_activity ?? 0;
        const db = b.days_since_last_activity ?? 0;
        if (da !== db) return db - da;
        return (b.monthlyValueCents ?? 0) - (a.monthlyValueCents ?? 0);
      })
      .slice(0, 5)
      .map((m) => ({
        id: m.id,
        name: m.name,
        phone: m.phone,
        plan: m.membership_plan,
        monthlyValueCents: m.monthlyValueCents,
        reasons: m.reasons,
        daysSinceLastActivity: m.days_since_last_activity,
      }));

    const nextSunday = new Date(today + 'T12:00:00Z');
    const todayDow = nextSunday.getUTCDay();
    const daysToSunday = todayDow === 0 ? 0 : 7 - todayDow;
    nextSunday.setUTCDate(nextSunday.getUTCDate() + daysToSunday);
    const sevenDaysOut = nextSunday.toISOString().slice(0, 10);

    const expiringPlans = (membersRes.data ?? [])
      .filter((m) => {
        if (!m.plan_ends_on) return false;
        return m.plan_ends_on >= today && m.plan_ends_on <= sevenDaysOut;
      })
      .map((m) => ({
        id: m.id,
        name: m.name ?? null,
        plan: m.membership_plan ?? null,
        planEndsOn: m.plan_ends_on as string,
        expiryLabel: planExpiryLabelBi(today, m.plan_ends_on as string, 'es'),
        expiryLabelEn: planExpiryLabelBi(today, m.plan_ends_on as string, 'en'),
        monthlyValueCents: planValueMap.get(m.id) ?? null,
      }))
      .sort((a, b) => a.planEndsOn.localeCompare(b.planEndsOn));

    // Class SLOTS: group by class + weekday + hour
    const slotKey = (name: string, wd: number, h: number) => `${name}||${wd}||${h}`;

    // Count how many distinct weeks each slot appeared in (last 4 weeks)
    const slotWeekSets = new Map<string, Set<string>>();
    for (const v of visits) {
      const name = v.class_name ?? '(Sin clase)';
      const { weekday, hour } = toBogotaWeekdayAndHour(v.visited_at);
      const key = slotKey(name, weekday, hour);
      const bogotaDate = toBogotaDate(v.visited_at);
      if (!slotWeekSets.has(key)) slotWeekSets.set(key, new Set());
      // Determine which week this visit belongs to (by its Monday)
      const vDate = new Date(bogotaDate + 'T12:00:00Z');
      const vDow = vDate.getUTCDay();
      const mondayOff = vDow === 0 ? 6 : vDow - 1;
      const mondayDate = new Date(vDate);
      mondayDate.setUTCDate(mondayDate.getUTCDate() - mondayOff);
      slotWeekSets.get(key)!.add(mondayDate.toISOString().slice(0, 10));
    }

    const qualifiedSlots = new Set<string>();
    for (const [key, weeks] of slotWeekSets) {
      if (weeks.size >= 2) qualifiedSlots.add(key);
    }

    // Aggregate current week visits by slot, only qualified slots
    const weekSlotCounts = new Map<string, ClassSlot>();
    for (const v of weekVisits) {
      const name = v.class_name ?? '(Sin clase)';
      const { weekday, hour } = toBogotaWeekdayAndHour(v.visited_at);
      const key = slotKey(name, weekday, hour);
      if (!qualifiedSlots.has(key)) continue;
      const existing = weekSlotCounts.get(key);
      if (existing) {
        existing.visits++;
      } else {
        weekSlotCounts.set(key, {
          className: name,
          weekday,
          hour,
          weekdayName: '',
          visits: 1,
        });
      }
    }

    const slots = Array.from(weekSlotCounts.values());
    const fullest = slots.length > 0
      ? slots.reduce((a, b) => (b.visits > a.visits ? b : a))
      : null;
    const emptiest = slots.length > 1
      ? slots.filter((s) => s !== fullest).reduce((a, b) => (b.visits < a.visits ? b : a))
      : null;

    return NextResponse.json({
      success: true,
      data: {
        week,
        currency: gymCurrency,
        numbers: {
          visits: weekVisits.length,
          visits_prev: prevVisits.length,
          visits_pct: pctChange(weekVisits.length, prevVisits.length),
          active_members: uniqueVisitors.size,
          active_members_prev: prevUniqueVisitors.size,
          new_members: newMembers,
          new_members_prev: prevNewMembers,
          touches: weekTouches.length,
          touches_prev: prevTouches.length,
          came_back: cameBackCount,
          recovered_cents: recoveredCents,
          at_risk_cents: atRiskCents,
        },
        came_back_members: cameBackMembers,
        to_contact: toContact,
        expiring_plans: expiringPlans,
        classes: {
          fullest,
          emptiest,
        },
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/weekly' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
