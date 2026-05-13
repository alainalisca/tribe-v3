/**
 * GET /api/tribe-os/intelligence
 *
 * Returns the active (non-dismissed, non-expired) community_insights
 * for the caller's gym, ordered CRITICAL → HIGH → MEDIUM → LOW then
 * newest first.
 *
 * Reads gate via RLS on community_insights (gym_coaches membership).
 *
 * Query params:
 *   include_actioned=true  — include dismissed cards (history view)
 *   include_expired=true   — include expired cards
 *
 * Response (200): { success: true, data: { insights: CommunityInsight[] } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { listInsightsForGym } from '@/lib/dal/communityInsights';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const includeActioned = url.searchParams.get('include_actioned') === 'true';
    const includeExpired = url.searchParams.get('include_expired') === 'true';

    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success) {
      return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
    }
    if (!gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }

    const result = await listInsightsForGym(supabase, gymRes.data.id, {
      unactionedOnly: !includeActioned,
      activeOnly: !includeExpired,
    });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'list_failed' }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      data: { insights: result.data ?? [] },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/intelligence' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
