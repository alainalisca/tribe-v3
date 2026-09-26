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
      .select('client_id, channel, created_at')
      .eq('gym_id', gymId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (touchesErr) throw touchesErr;

    const touchMap = new Map<string, { channel: string; created_at: string }>();
    for (const t of touches ?? []) {
      if (!touchMap.has(t.client_id)) {
        touchMap.set(t.client_id, { channel: t.channel, created_at: t.created_at });
      }
    }

    const rows = (members ?? []).map((m) => {
      const s = scoreMap.get(m.id);
      const lastActivity = s?.signals?.days_since_last_activity;
      const touch = touchMap.get(m.id);
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
