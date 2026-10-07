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

const BOGOTA = 'America/Bogota';

function bogotaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BOGOTA });
}

function bogotaWeekday(dateStr: string): string {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const d = new Date(dateStr + 'T12:00:00Z');
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  return days[bogota.getDay()];
}

function bogotaDateLabel(today: string): string {
  const d = new Date(today + 'T12:00:00Z');
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  const day = bogota.getDate();
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const weekday = bogotaWeekday(today);
  return `Hoy, ${weekday} ${day} de ${months[bogota.getMonth()]}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface BriefingContact {
  id: string;
  name: string | null;
  phone: string | null;
  score: number | null;
  reason: string | null;
  touchedToday: boolean;
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

    // ── Parallel queries ──────────────────────────────────
    const [membersRes, scoresRes, touchesRes, visitsRes, unpaidRes, sessionsRes] = await Promise.all([
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

    const scoreMap = new Map(scores.map((s) => [s.client_id, s]));
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Latest visit per client
    const visitMap = new Map<string, { visited_at: string; coach_name: string | null; class_name: string | null }>();
    for (const v of visits) {
      if (!visitMap.has(v.client_id)) {
        visitMap.set(v.client_id, { visited_at: v.visited_at, coach_name: v.coach_name, class_name: v.class_name });
      }
    }

    // Touch map: most recent touch per client in last 7 days
    const touchMap = new Map<string, string>();
    for (const t of touches) {
      if (!touchMap.has(t.client_id)) touchMap.set(t.client_id, t.created_at);
    }

    // Touch today: any touch whose created_at is today (Bogota)
    const todayTouched = new Set<string>();
    for (const t of touches) {
      const touchDate = new Date(t.created_at).toLocaleDateString('en-CA', { timeZone: BOGOTA });
      if (touchDate === today) todayTouched.add(t.client_id);
    }

    // ── 1. Contact today (top 5 by score from high/medium retention) ──
    const contactCandidates = scores
      .filter((s) => s.level === 'high' || s.level === 'medium')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const contactToday: BriefingContact[] = contactCandidates.slice(0, 5).map((s) => {
      const m = memberMap.get(s.client_id);
      const v = visitMap.get(s.client_id);
      const days = s.signals?.days_since_last_activity ?? null;
      let lastActivityAt: string | null = s.signals?.last_activity_at ?? null;
      if (v && (!lastActivityAt || new Date(v.visited_at) > new Date(lastActivityAt))) {
        lastActivityAt = v.visited_at;
      }
      const reasons: string[] = s.reasons ?? [];
      const shortReason = reasons[0]?.split(' / ')[0] ?? null;
      const cameBack = !!(lastActivityAt && days !== null && days <= 7 && (s.level === 'high' || s.level === 'medium'));

      return {
        id: s.client_id,
        name: m?.name ?? null,
        phone: m?.phone ?? null,
        score: s.score,
        reason: shortReason,
        touchedToday: todayTouched.has(s.client_id),
        coachName: v?.coach_name ?? null,
        className: v?.class_name ?? null,
        classStartTime: v?.visited_at ?? null,
        planEndsOn: m?.plan_ends_on ?? null,
        daysSinceLastActivity: days,
        lastActivityAt,
        reasons,
        cameBack,
      };
    });

    // Sort: untouched first, touched at bottom
    contactToday.sort((a, b) => {
      if (a.touchedToday !== b.touchedToday) return a.touchedToday ? 1 : -1;
      return (b.score ?? 0) - (a.score ?? 0);
    });

    // ── 2. Came back (returned after a touch in last 7 days) ──
    const cameBack: BriefingCameBack[] = [];
    for (const s of scores) {
      const days = s.signals?.days_since_last_activity ?? null;
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
        const expired = m.plan_ends_on < today;
        const weekday = bogotaWeekday(m.plan_ends_on);
        const label = expired ? `venció el ${weekday}` : `vence el ${weekday}`;
        const s = scoreMap.get(m.id);
        const v = visitMap.get(m.id);
        const days = s?.signals?.days_since_last_activity ?? null;
        let lastActivityAt: string | null = s?.signals?.last_activity_at ?? null;
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
    const contactCount = contactToday.filter((c) => !c.touchedToday).length;
    if (contactCount > 0) parts.push(`${contactCount} persona${contactCount > 1 ? 's' : ''} para contactar`);
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
