/**
 * GET /api/tribe-os/dashboard/milestones
 *
 * Returns clients currently on an active streak of 7+ days, sorted
 * by `current_streak_days` DESC. Powers the dashboard's "Celebrate
 * these wins" widget — the mirror image of the at-risk widget that
 * surfaces members who are slipping. Both belong on the dashboard
 * because both are "do something today" coach prompts: one is a
 * save-the-relationship nudge, the other is a reinforce-the-
 * relationship nudge.
 *
 * Auth:
 *   - Tribe.OS premium gate
 *   - RLS scopes the underlying clients read
 *
 * Response: { success: true, data: { streakers: ActiveStreaker[] } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listActiveStreakers } from '@/lib/dal/clients';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const result = await listActiveStreakers(supabase, { gymId: gymId ?? null, instructorUserId: userId });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { streakers: result.data ?? [] } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/milestones' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
