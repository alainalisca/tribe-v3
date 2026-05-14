/**
 * GET /api/tribe-os/dashboard/recently-ended
 *
 * Returns sessions that ended in the last few hours so the
 * dashboard can prompt "you just finished class — record
 * attendance." A stickiness play: capturing attendance right after
 * the moment of intent maximises the data quality the rest of
 * Tribe.OS depends on (streaks, health status, churn risk).
 *
 * Auth:
 *   - Tribe.OS premium gate
 *   - RLS keeps the underlying read scoped — gym-aware caller, or
 *     fall back to single-instructor scope when gymId is null.
 *
 * Query params:
 *   - window_hours (optional, 1-12, default 4) — look-back window.
 *
 * Response: { success: true, data: { sessions: RecentlyEndedSession[] } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { fetchRecentlyEndedSessions } from '@/lib/dal/recentSessions';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const windowRaw = url.searchParams.get('window_hours');
    const windowParsed = windowRaw ? Number.parseInt(windowRaw, 10) : undefined;
    const windowHours = Number.isFinite(windowParsed) ? windowParsed : undefined;

    const result = await fetchRecentlyEndedSessions(
      supabase,
      { gymId: gymId ?? null, instructorUserId: userId },
      { windowHours }
    );
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { sessions: result.data ?? [] } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/recently-ended' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
