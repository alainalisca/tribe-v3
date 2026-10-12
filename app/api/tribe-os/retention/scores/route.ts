import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { daysSinceVisit } from '@/lib/tribe-os/daysSinceVisit';

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const coachDisplayName: string | null = (user?.user_metadata?.name as string) ?? null;

  try {
    const { data: members, error: membersErr } = await supabase
      .from('clients')
      .select('id, name, phone, joined_on, tags, external_id, plan_ends_on')
      .eq('gym_id', gymId);

    if (membersErr) throw membersErr;

    const { data: scores, error: scoresErr } = await supabase
      .from('client_retention_v2')
      .select('client_id, score, level, reasons, signals, computed_at')
      .eq('gym_id', gymId);

    if (scoresErr) throw scoresErr;

    const scoreMap = new Map((scores ?? []).map((s) => [s.client_id, s]));

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: touches, error: touchesErr } = await supabase
      .from('client_touches')
      .select('id, client_id, channel, created_at')
      .eq('gym_id', gymId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (touchesErr) throw touchesErr;

    const touchMap = new Map<string, { id: string; channel: string; created_at: string }>();
    for (const t of touches ?? []) {
      if (!touchMap.has(t.client_id)) {
        touchMap.set(t.client_id, { id: t.id, channel: t.channel, created_at: t.created_at });
      }
    }

    // Fetch latest visit per client from client_visits (imported visits)
    const { data: recentVisits } = await supabase
      .from('client_visits')
      .select('client_id, visited_at, coach_name, class_name')
      .eq('gym_id', gymId)
      .order('visited_at', { ascending: false });

    const latestVisitMap = new Map<
      string,
      { visited_at: string; coach_name: string | null; class_name: string | null }
    >();
    for (const v of recentVisits ?? []) {
      if (!latestVisitMap.has(v.client_id)) {
        latestVisitMap.set(v.client_id, {
          visited_at: v.visited_at,
          coach_name: v.coach_name,
          class_name: v.class_name,
        });
      }
    }

    const rows = (members ?? []).map((m) => {
      const s = scoreMap.get(m.id);
      const staleLastActivity = s?.signals?.days_since_last_activity ?? null;
      const touch = touchMap.get(m.id);

      // Best last_activity_at: from signals (if recomputed), or from client_visits
      let lastActivityAt: string | null = s?.signals?.last_activity_at ?? null;
      const latestVisit = latestVisitMap.get(m.id);
      if (latestVisit) {
        if (!lastActivityAt || new Date(latestVisit.visited_at) > new Date(lastActivityAt)) {
          lastActivityAt = latestVisit.visited_at;
        }
      }
      // Fallback: derive from computed_at - days_since_last_activity (approximate)
      if (!lastActivityAt && staleLastActivity !== null && s?.computed_at) {
        lastActivityAt = new Date(new Date(s.computed_at).getTime() - staleLastActivity * 86_400_000).toISOString();
      }

      // Compute fresh days_since_last_activity from lastActivityAt via daysSinceVisit
      const freshDaysSince = daysSinceVisit(lastActivityAt, now);

      return {
        id: m.id,
        external_id: m.external_id ?? null,
        name: m.name,
        phone: m.phone,
        joined_on: m.joined_on,
        tags: m.tags,
        plan_ends_on: m.plan_ends_on ?? null,
        score: s?.score ?? null,
        level: s?.level ?? null,
        reasons: s?.reasons ?? [],
        days_since_last_activity: freshDaysSince,
        last_activity_at: lastActivityAt,
        visits_last_14d: s?.signals?.visits_last_14d ?? 0,
        visits_last_28d: s?.signals?.visits_last_28d ?? 0,
        computed_at: s?.computed_at ?? null,
        last_touch: touch ?? null,
        last_visit_coach: latestVisit?.coach_name ?? null,
        last_visit_class: latestVisit?.class_name ?? null,
        last_visit_at: latestVisit?.visited_at ?? null,
      };
    });

    const hasActivity = rows.filter((r) => r.level !== null || r.days_since_last_activity !== null);

    const activeMembers = hasActivity.filter(
      (r) => r.days_since_last_activity !== null && r.days_since_last_activity <= 7
    ).length;

    const highRisk = hasActivity.filter((r) => r.level === 'high').length;

    const recentVisitors = hasActivity.filter((r) => r.visits_last_14d > 0).length;

    return NextResponse.json({
      success: true,
      data: {
        members: hasActivity,
        coachDisplayName,
        stats: { activeMembers, highRisk, recentVisitors },
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/retention/scores' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
