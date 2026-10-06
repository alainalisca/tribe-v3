import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const { data: members, error: membersErr } = await supabase
      .from('clients')
      .select('id, name, phone, joined_on, tags')
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
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: recentVisits } = await supabase
      .from('client_visits')
      .select('client_id, visited_at')
      .eq('gym_id', gymId)
      .gte('visited_at', thirtyDaysAgo.toISOString())
      .order('visited_at', { ascending: false });

    const latestVisitMap = new Map<string, string>();
    for (const v of recentVisits ?? []) {
      if (!latestVisitMap.has(v.client_id)) {
        latestVisitMap.set(v.client_id, v.visited_at);
      }
    }

    const rows = (members ?? []).map((m) => {
      const s = scoreMap.get(m.id);
      const lastActivity = s?.signals?.days_since_last_activity;
      const touch = touchMap.get(m.id);

      // Best last_activity_at: from signals (if recomputed), or from client_visits
      let lastActivityAt: string | null = s?.signals?.last_activity_at ?? null;
      const latestVisit = latestVisitMap.get(m.id);
      if (latestVisit) {
        if (!lastActivityAt || new Date(latestVisit) > new Date(lastActivityAt)) {
          lastActivityAt = latestVisit;
        }
      }
      // Fallback: derive from computed_at - days_since_last_activity (approximate)
      if (!lastActivityAt && lastActivity !== null && s?.computed_at) {
        lastActivityAt = new Date(new Date(s.computed_at).getTime() - lastActivity * 86_400_000).toISOString();
      }

      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        joined_on: m.joined_on,
        tags: m.tags,
        score: s?.score ?? null,
        level: s?.level ?? null,
        reasons: s?.reasons ?? [],
        days_since_last_activity: lastActivity ?? null,
        last_activity_at: lastActivityAt,
        visits_last_14d: s?.signals?.visits_last_14d ?? 0,
        visits_last_28d: s?.signals?.visits_last_28d ?? 0,
        computed_at: s?.computed_at ?? null,
        last_touch: touch ?? null,
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
        stats: { activeMembers, highRisk, recentVisitors },
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/retention/scores' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
