/**
 * GET /api/tribe-os/dashboard/week-recap
 *
 * Returns rolling 7-day attendance numbers for the caller's gym:
 *   - attended_count_last_7d / _prev_7d
 *   - unique_members_last_7d / _prev_7d
 *
 * Companion to DashboardStats (which shows monthly numbers). The
 * week-recap card targets a different time scale — "are we on a
 * good pace this week vs last week?" — that monthly KPIs blur out.
 *
 * Rolling windows (not calendar weeks) so the delta is meaningful
 * any day of the week. Same approach as the member-side
 * /my-coach last-7-days card.
 *
 * Auth:
 *   - Tribe.OS premium gate
 *   - RLS scopes attendance reads via client.instructor_user_id or
 *     gym membership
 *
 * Response: { success: true, data: { ... } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    const resolvedGymId = gymRes.data.id;

    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Two parallel range queries against client_attendance. We fetch
    // (attended_at, client_id) for each window — small payload,
    // letting us compute unique-member counts client-side without a
    // second round trip per window.
    const [lastRes, prevRes] = await Promise.all([
      supabase
        .from('client_attendance')
        .select('client_id, attended_at, client:clients(gym_id)')
        .eq('attended', true)
        .gte('attended_at', sevenDaysAgo),
      supabase
        .from('client_attendance')
        .select('client_id, attended_at, client:clients(gym_id)')
        .eq('attended', true)
        .gte('attended_at', fourteenDaysAgo)
        .lt('attended_at', sevenDaysAgo),
    ]);

    if (lastRes.error) {
      logError(lastRes.error, { action: 'week_recap.last_7d', gymId: resolvedGymId });
      return NextResponse.json({ success: false, error: lastRes.error.message }, { status: 500 });
    }
    if (prevRes.error) {
      logError(prevRes.error, { action: 'week_recap.prev_7d', gymId: resolvedGymId });
      return NextResponse.json({ success: false, error: prevRes.error.message }, { status: 500 });
    }

    // RLS scopes attendance to the caller's clients, which for a
    // gym-tenant flow already restricts to one gym's clients. The
    // explicit gym_id filter via the joined client is belt-and-
    // suspenders: it ensures cross-gym contamination is impossible
    // even if a future RLS change widens the scope.
    function counts(rows: Array<{ client_id: string; client?: { gym_id?: string } | null }>): {
      attended_count: number;
      unique_members: number;
    } {
      const filtered = rows.filter((r) => {
        const cg = (r.client as unknown as { gym_id?: string } | null)?.gym_id;
        return cg === resolvedGymId;
      });
      const uniqueClients = new Set(filtered.map((r) => r.client_id));
      return { attended_count: filtered.length, unique_members: uniqueClients.size };
    }

    const last = counts((lastRes.data ?? []) as Array<{ client_id: string; client?: { gym_id?: string } | null }>);
    const prev = counts((prevRes.data ?? []) as Array<{ client_id: string; client?: { gym_id?: string } | null }>);

    return NextResponse.json({
      success: true,
      data: {
        attended_count_last_7d: last.attended_count,
        attended_count_prev_7d: prev.attended_count,
        unique_members_last_7d: last.unique_members,
        unique_members_prev_7d: prev.unique_members,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/week-recap' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
