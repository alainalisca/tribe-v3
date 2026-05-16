/**
 * GET /api/tribe-os/audit/count
 *
 * Returns the count of audit entries in the caller's gym since a
 * `since` ISO timestamp (query param). Powers the dashboard
 * "N new audit entries since you last looked" chip.
 *
 * Separate from the full list endpoint because the dashboard only
 * needs a number, not row data — and the count query is much
 * cheaper than fetching joined rows just to throw them away.
 *
 * Auth:
 *   - Tribe.OS premium gate
 *   - RLS gates the count to the caller's gym
 *
 * Query params:
 *   - since  required, ISO timestamp lower bound on created_at.
 *            Missing → 400.
 *
 * Response: { success: true, data: { count: number } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const since = url.searchParams.get('since')?.trim() || '';
    if (!since) {
      return NextResponse.json({ success: false, error: 'since_required' }, { status: 400 });
    }
    // Defensive parse — if the client sends junk, return 400 rather
    // than silently counting all rows since the epoch.
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) {
      return NextResponse.json({ success: false, error: 'invalid_since' }, { status: 400 });
    }

    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }

    // We deliberately exclude system-written suppression rows
    // (gym.alert_sent) from the "new since" count — they're noise
    // for the discoverability chip. The user cares about events
    // someone did, not events the watchdog wrote about events.
    const { count, error } = await supabase
      .from('gym_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymRes.data.id)
      .gte('created_at', sinceDate.toISOString())
      .neq('action', 'gym.alert_sent');

    if (error) {
      logError(error, { action: 'audit.count', gymId: gymRes.data.id });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { count: count ?? 0 } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/audit/count' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
