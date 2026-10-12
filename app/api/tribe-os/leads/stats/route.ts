import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { LEAD_STATUSES, LEAD_SOURCES } from '@/lib/tribe-os/leads/constants';

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const { data, error } = await supabase
      .from('tribe_os_leads')
      .select('status, source')
      .eq('gym_id', gymId);

    if (error) {
      logError(error, { route: 'GET /api/tribe-os/leads/stats', gymId });
      return NextResponse.json({ success: false, error: 'stats_failed' }, { status: 500 });
    }

    const rows = data ?? [];
    const byStatus: Record<string, number> = {};
    for (const s of LEAD_STATUSES) byStatus[s] = 0;

    const bySource: Record<string, { total: number; joined: number }> = {};
    for (const src of LEAD_SOURCES) bySource[src] = { total: 0, joined: 0 };

    let trialReached = 0;
    let trialCompleted = 0;

    for (const row of rows) {
      const st = row.status as string;
      const src = row.source as string;
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (bySource[src]) {
        bySource[src].total++;
        if (st === 'joined') bySource[src].joined++;
      }
      if (st === 'trial_booked' || st === 'trial_done' || st === 'joined') {
        trialReached++;
      }
      if (st === 'trial_done' || st === 'joined') {
        trialCompleted++;
      }
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: newThisMonth, error: countErr } = await supabase
      .from('tribe_os_leads')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (countErr) {
      logError(countErr, { route: 'GET /api/tribe-os/leads/stats', gymId });
    }

    return NextResponse.json({
      success: true,
      data: {
        total: rows.length,
        by_status: byStatus,
        by_source: bySource,
        trial_reached: trialReached,
        trial_completed: trialCompleted,
        new_last_30d: newThisMonth ?? 0,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/leads/stats' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
