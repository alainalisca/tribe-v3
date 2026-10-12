/**
 * GET /api/tribe-os/briefing
 *
 * Read-only daily aggregation for the "Hoy" dashboard card.
 * Reuses existing tables (clients, client_retention_v2,
 * client_touches, client_visits, sessions) — no new tables.
 *
 * Response: { success, data: BriefingData }
 */

import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listGymMemberUserIds } from '@/lib/dal/gymCoaches';
import { listUnpaidAttendance } from '@/lib/dal/clients';
import { humanizeReason } from '@/lib/tribe-os/forecast';
import { filterContactToday } from '@/lib/tribe-os/contactFilter';
import { bogotaToday, bogotaDateLabel, addDays, planExpiryLabel } from '@/lib/tribe-os/dates';
import { daysSinceVisit } from '@/lib/tribe-os/daysSinceVisit';

const BOGOTA = 'America/Bogota';

export interface BriefingContact {
  id: string;
  name: string | null;
  phone: string | null;
  score: number | null;
  reason: string | null;
  coachName: string | null;
  className: string | null;
  classStartTime: string | null;
  planEndsOn: string | null;
  daysSinceLastActivity: number | null;
  lastActivityAt: string | null;
  reasons: string[];
  cameBack: boolean;
}

export interface BriefingCameBack {
  id: string;
  name: string | null;
}

export interface BriefingPlanExpiry {
  id: string;
  name: string | null;
  phone: string | null;
  planEndsOn: string;
  label: string;
  coachName: string | null;
  className: string | null;
  classStartTime: string | null;
  daysSinceLastActivity: number | null;
  lastActivityAt: string | null;
  reasons: string[];
}

export interface BriefingSession {
  id: string;
  title: string | null;
  startTime: string | null;
  currentParticipants: number | null;
  maxParticipants: number | null;
}

export interface BriefingData {
  headerDate: string;
  summary: string;
  contactToday: BriefingContact[];
  cameBack: BriefingCameBack[];
  planExpiry: BriefingPlanExpiry[];
  todaySessions: BriefingSession[];
  unpaidCount: number;
  unpaidTotal: Record<string, number>;
  coachDisplayName: string | null;
}

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const coachDisplayName: string | null = (user?.user_metadata?.name as string) ?? null;

  try {
    const today = bogotaToday();
    const sevenDaysAgo = addDays(today, -7);
    const sevenDaysFromNow = addDays(today, 7);

    const [membersRes, scoresRes, touchesRes, visitsRes, latestVisitsRes, unpaidRes, sessionsRes] = await Promise.all([
      supabase.from('clients').select('id, name, phone, plan_ends_on').eq('gym_id', gymId),
      supabase
        .from('client_retention_v2')
        .select('client_id, score, level, reasons, signals, computed_at')
        .eq('gym_id', gymId),
      supabase
        .from('client_touches')
        .select('id, client_id, created_at')
        .eq('gym_id', gymId)
        .gte('created_at', new Date(sevenDaysAgo + 'T00:00:00Z').toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('client_visits')
        .select('client_id, visited_at, coach_name, class_name')
        .eq('gym_id', gymId)
        .gte('visited_at', new Date(addDays(today, -30) + 'T00:00:00Z').toISOString())
        .order('visited_at', { ascending: false }),
      // Latest visit per member (no date filter) — used to compute fresh daysSinceLastActivity
      supabase
        .from('client_visits')
        .select('client_id, visited_at')
        .eq('gym_id', gymId)
        .order('visited_at', { ascending: false }),
      listUnpaidAttendance(supabase, { windowDays: 60 }),
      (async () => {
        let query = supabase
          .from('sessions')
          .select(
            `id, title, start_time, current_participants, max_participants,
             creator:users!sessions_creator_id_fkey(name)`
          )
          .eq('date', today);
        if (gymId) {
          const membersR = await listGymMemberUserIds(supabase, gymId);
          const ids = membersR.success && membersR.data && membersR.data.length > 0 ? membersR.data : [userId];
          query = query.in('creator_id', ids);
        }
        return query.order('start_time', { ascending: true });
      })(),
    ]);

    if (membersRes.error) throw membersRes.error;
    if (scoresRes.error) throw scoresRes.error;

    const members = membersRes.data ?? [];
    const scores = scoresRes.data ?? [];
    const touches = touchesRes.data ?? [];
    const visits = visitsRes.data ?? [];
    const latestVisits = latestVisitsRes.data ?? [];

    const scoreMap = new Map(scores.map((s) => [s.client_id, s]));
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Recent visits (last 30 days) — used for coach/class display info
    const visitMap = new Map<string, { visited_at: string; coach_name: string | null; class_name: string | null }>();
    for (const v of visits) {
      if (!visitMap.has(v.client_id)) {
        visitMap.set(v.client_id, { visited_at: v.visited_at, coach_name: v.coach_name, class_name: v.class_name });
      }
    }

    // Latest visit per member (no date restriction) — used for fresh daysSince computation
    const latestVisitMap = new Map<string, string>();
    for (const v of latestVisits) {
      if (!latestVisitMap.has(v.client_id)) {
        latestVisitMap.set(v.client_id, v.visited_at);
      }
    }

    const touchMap = new Map<string, string>();
    for (const t of touches) {
      if (!touchMap.has(t.client_id)) touchMap.set(t.client_id, t.created_at);
    }

    // ── 1. Contact today — shared filter with retention page ──
    // Build rows compatible with ContactFilterRow
    const filterRows = scores.map((s) => {
      const m = memberMap.get(s.client_id);
      const freshDays = daysSinceVisit(latestVisitMap.get(s.client_id) ?? null);
      return {
        id: s.client_id,
        level: s.level,
        score: s.score,
        days_since_last_activity: freshDays ?? (s.signals?.days_since_last_activity ?? null),
        last_touch: touchMap.has(s.client_id) ? { created_at: touchMap.get(s.client_id)! } : null,
        _score: s,
        _member: m,
      };
    });

    const filtered = filterContactToday(filterRows).slice(0, 5);

    const contactToday: BriefingContact[] = filtered.map((row) => {
      const s = row._score;
      const m = row._member;
      const v = visitMap.get(row.id);
      const latestVisitedAt = latestVisitMap.get(row.id) ?? null;
      const days = daysSinceVisit(latestVisitedAt) ?? (s.signals?.days_since_last_activity ?? null);
      let lastActivityAt: string | null = latestVisitedAt ?? (s.signals?.last_activity_at ?? null);
      if (v && (!lastActivityAt || new Date(v.visited_at) > new Date(lastActivityAt))) {
        lastActivityAt = v.visited_at;
      }
      const reasons: string[] = s.reasons ?? [];
      const rawShort = reasons[0]?.split(' / ')[0] ?? null;
      const shortReason = rawShort ? humanizeReason(rawShort, lastActivityAt, 'es') : null;

      return {
        id: row.id,
        name: m?.name ?? null,
        phone: m?.phone ?? null,
        score: s.score,
        reason: shortReason,
        coachName: v?.coach_name ?? null,
        className: v?.class_name ?? null,
        classStartTime: v?.visited_at ?? null,
        planEndsOn: m?.plan_ends_on ?? null,
        daysSinceLastActivity: days,
        lastActivityAt,
        reasons,
        cameBack: false,
      };
    });

    // ── 2. Came back (returned after a touch in last 7 days) ──
    const cameBack: BriefingCameBack[] = [];
    for (const s of scores) {
      const freshDays = daysSinceVisit(latestVisitMap.get(s.client_id) ?? null);
      const days = freshDays ?? (s.signals?.days_since_last_activity ?? null);
      if (days !== null && days <= 7 && touchMap.has(s.client_id)) {
        const m = memberMap.get(s.client_id);
        cameBack.push({ id: s.client_id, name: m?.name ?? null });
      }
    }

    // ── 3. Plan expiry (next 7 days + expired last 7 days) ──
    const planExpiry: BriefingPlanExpiry[] = [];
    for (const m of members) {
      if (!m.plan_ends_on) continue;
      if (m.plan_ends_on >= sevenDaysAgo && m.plan_ends_on <= sevenDaysFromNow) {
        const label = planExpiryLabel(today, m.plan_ends_on);
        const s = scoreMap.get(m.id);
        const v = visitMap.get(m.id);
        const latestVisitedAt = latestVisitMap.get(m.id) ?? null;
        const days = daysSinceVisit(latestVisitedAt) ?? (s?.signals?.days_since_last_activity ?? null);
        let lastActivityAt: string | null = latestVisitedAt ?? (s?.signals?.last_activity_at ?? null);
        if (v && (!lastActivityAt || new Date(v.visited_at) > new Date(lastActivityAt))) {
          lastActivityAt = v.visited_at;
        }

        planExpiry.push({
          id: m.id,
          name: m.name,
          phone: m.phone,
          planEndsOn: m.plan_ends_on,
          label,
          coachName: v?.coach_name ?? null,
          className: v?.class_name ?? null,
          classStartTime: v?.visited_at ?? null,
          daysSinceLastActivity: days,
          lastActivityAt,
          reasons: s?.reasons ?? [],
        });
      }
    }
    planExpiry.sort((a, b) => a.planEndsOn.localeCompare(b.planEndsOn));

    // ── 3b. Dedupe: members in both contactToday and planExpiry ──
    // Show them once in "Contacta hoy" with a combined reason line,
    // using the plan draft case (plan_expiring / plan_expired).
    const contactIds = new Set(contactToday.map((c) => c.id));
    const dupeIds = new Set<string>();
    for (const p of planExpiry) {
      if (contactIds.has(p.id)) dupeIds.add(p.id);
    }
    if (dupeIds.size > 0) {
      const planMap = new Map(planExpiry.map((p) => [p.id, p]));
      for (const c of contactToday) {
        const p = planMap.get(c.id);
        if (!p) continue;
        c.planEndsOn = p.planEndsOn;
        const planReason = p.planEndsOn <= today
          ? `Su plan venció / Plan expired`
          : `Su plan vence / Plan expires`;
        if (!c.reasons.some((r) => r.includes('plan venc') || r.includes('Plan expir'))) {
          c.reasons = [...c.reasons, planReason];
        }
        const days = c.daysSinceLastActivity;
        const planLabel = p.label;
        c.reason = days !== null ? `${days} días sin venir · ${planLabel}` : planLabel;
      }
      // Remove dupes from planExpiry
      planExpiry.splice(0, planExpiry.length, ...planExpiry.filter((p) => !dupeIds.has(p.id)));
    }

    // ── 4. Today's sessions ──
    const todaySessions: BriefingSession[] = (sessionsRes.data ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? null,
      startTime: (row.start_time as string | null) ?? null,
      currentParticipants: (row.current_participants as number | null) ?? null,
      maxParticipants: (row.max_participants as number | null) ?? null,
    }));

    // ── 5. Unpaid count/total ──
    let unpaidCount = 0;
    const unpaidTotal: Record<string, number> = {};
    if (unpaidRes.success && unpaidRes.data) {
      const groups = unpaidRes.data.groups ?? [];
      unpaidCount = groups.length;
      if (unpaidRes.data.suggested_amount_cents) {
        for (const [cur, cents] of Object.entries(unpaidRes.data.suggested_amount_cents)) {
          unpaidTotal[cur] = cents as number;
        }
      }
    }

    // ── Summary line ──
    const parts: string[] = [];
    if (contactToday.length > 0)
      parts.push(`${contactToday.length} persona${contactToday.length > 1 ? 's' : ''} para contactar`);
    if (planExpiry.length > 0)
      parts.push(
        `${planExpiry.length} plan${planExpiry.length > 1 ? 'es' : ''} vence${planExpiry.length > 1 ? 'n' : ''} esta semana`
      );
    if (cameBack.length > 0) parts.push(`${cameBack.length} volvieron`);
    const summary = parts.length > 0 ? parts.join(', ') + '.' : 'Todo en orden hoy. Nadie en riesgo alto.';

    const data: BriefingData = {
      headerDate: bogotaDateLabel(today),
      summary,
      contactToday,
      cameBack,
      planExpiry,
      todaySessions,
      unpaidCount,
      unpaidTotal,
      coachDisplayName,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/briefing' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
