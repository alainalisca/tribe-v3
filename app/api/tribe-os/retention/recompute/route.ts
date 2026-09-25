import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { scoreRetention } from '@/lib/tribe-os/retention';

export async function POST(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const { data: members, error: membersErr } = await supabase
      .from('clients')
      .select('id, joined_on, plan_ends_on')
      .eq('gym_id', gymId);

    if (membersErr) throw membersErr;
    if (!members || members.length === 0) {
      return NextResponse.json({ success: true, data: { computed: 0 } });
    }

    const clientIds = members.map((m) => m.id);

    const { data: activities, error: actErr } = await supabase
      .from('client_activity_v2')
      .select('client_id, activity_at')
      .eq('gym_id', gymId)
      .in('client_id', clientIds);

    if (actErr) throw actErr;

    const actByClient = new Map<string, { activity_at: string }[]>();
    for (const a of activities ?? []) {
      const list = actByClient.get(a.client_id) ?? [];
      list.push({ activity_at: a.activity_at });
      actByClient.set(a.client_id, list);
    }

    const rows = members.map((m) => {
      const result = scoreRetention({
        client_id: m.id,
        gym_id: gymId,
        joined_on: m.joined_on,
        plan_ends_on: m.plan_ends_on,
        activities: actByClient.get(m.id) ?? [],
      });
      return {
        client_id: result.client_id,
        gym_id: result.gym_id,
        score: result.score,
        level: result.level,
        reasons: result.reasons,
        signals: result.signals,
        computed_at: new Date().toISOString(),
      };
    });

    const { error: upsertErr } = await supabase.from('client_retention_v2').upsert(rows, { onConflict: 'client_id' });

    if (upsertErr) throw upsertErr;

    const counts = { high: 0, medium: 0, low: 0, new: 0, insufficient_data: 0 };
    for (const r of rows) {
      counts[r.level as keyof typeof counts]++;
    }

    return NextResponse.json({
      success: true,
      data: { computed: rows.length, counts },
    });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/retention/recompute' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
