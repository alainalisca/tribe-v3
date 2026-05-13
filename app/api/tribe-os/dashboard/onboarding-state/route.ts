/**
 * GET /api/tribe-os/dashboard/onboarding-state
 *
 * Returns three booleans the dashboard's OnboardingChecklist widget
 * uses to decide which checklist items are still pending:
 *
 *   has_client      — at least one non-archived client on the roster
 *   has_attendance  — at least one attendance row (anywhere in the gym)
 *   has_coach       — at least one non-owner gym_coaches row
 *
 * Used to drive the persistent first-week onboarding card on
 * /os/dashboard. When all three are true, the card auto-hides; the
 * user can also dismiss it manually (state persisted client-side
 * in localStorage).
 *
 * Three head-only queries fire in parallel. Errors are logged but
 * non-fatal — a failed individual query degrades that item to
 * false (assume pending) rather than 500-ing the whole endpoint.
 *
 * Response (200):
 *   { success: true, data: {
 *       has_client: boolean,
 *       has_attendance: boolean,
 *       has_coach: boolean,
 *     }
 *   }
 *
 * Failures: 401, 403, 500 — same gate semantics as other premium routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

interface OnboardingState {
  has_client: boolean;
  has_attendance: boolean;
  has_coach: boolean;
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    // Has at least one non-archived client.
    let clientsQuery = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('archived', false);
    if (gymId) {
      clientsQuery = clientsQuery.eq('gym_id', gymId);
    } else {
      clientsQuery = clientsQuery.eq('instructor_user_id', userId);
    }

    // Has at least one attendance row. RLS scopes this to the
    // caller's gym (or instructor on legacy path) so we don't need
    // an explicit filter — but we limit to 1 row so the round-trip
    // is cheap.
    const attendanceQuery = supabase.from('client_attendance').select('id', { count: 'exact', head: true }).limit(1);

    // Has at least one non-owner coach. Owner is always present
    // (created at subscription time), so the signal we want is
    // "more than one coach in the gym". Gym-keyed; on the legacy
    // path with no gym we treat as false (no multi-coach yet).
    const coachesQuery = gymId
      ? supabase
          .from('gym_coaches')
          .select('user_id', { count: 'exact', head: true })
          .eq('gym_id', gymId)
          .neq('role', 'owner')
      : Promise.resolve({ count: 0, error: null } as { count: number | null; error: null });

    const [clientsResult, attendanceResult, coachesResult] = await Promise.all([
      clientsQuery,
      attendanceQuery,
      coachesQuery,
    ]);

    if ('error' in clientsResult && clientsResult.error) {
      logError(clientsResult.error, { action: 'onboarding_state.clients', userId, gymId });
    }
    if ('error' in attendanceResult && attendanceResult.error) {
      logError(attendanceResult.error, { action: 'onboarding_state.attendance', userId, gymId });
    }
    if ('error' in coachesResult && coachesResult.error) {
      logError(coachesResult.error, { action: 'onboarding_state.coaches', userId, gymId });
    }

    const data: OnboardingState = {
      has_client: !(clientsResult as { error: unknown }).error && (clientsResult.count ?? 0) > 0,
      has_attendance: !(attendanceResult as { error: unknown }).error && (attendanceResult.count ?? 0) > 0,
      has_coach: !(coachesResult as { error: unknown }).error && (coachesResult.count ?? 0) > 0,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/onboarding-state' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
