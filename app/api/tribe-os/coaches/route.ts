/**
 * GET /api/tribe-os/coaches
 *
 * Returns the coach roster for the caller's gym. Read-only for now;
 * the invite/remove flow lands when beta has real instructors who
 * want to add coaches.
 *
 * Response (200):
 *   { success: true, data: { gym: { id, name, slug }, coaches: GymCoachWithUser[] } }
 *
 * Failure modes:
 *   401 not signed in
 *   403 not Tribe.OS premium
 *   404 no gym associated with this user yet (legacy users without
 *       a gym; rare post-Mission-6 of Week 1, but possible)
 *   500 server / DB error
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGymForUser } from '@/lib/dal/gyms';
import { listCoachesForGym } from '@/lib/dal/gymCoaches';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    // Resolve the gym. Prefer the gym id from the premium gate (set
    // when the user has a gym record); fall back to looking it up by
    // the user's id for the narrow case where requireTribeOSPremium
    // returned a legacy-path session with gymId = null.
    let resolvedGymId = gymId;
    let resolvedGymRow: { id: string; name: string; slug: string } | null = null;

    if (!resolvedGymId) {
      const gymRes = await getGymForUser(supabase, userId);
      if (!gymRes.success) {
        logError(new Error(gymRes.error ?? 'unknown'), { action: 'coaches.gym_lookup', userId });
        return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
      }
      if (!gymRes.data) {
        return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
      }
      resolvedGymId = gymRes.data.id;
      resolvedGymRow = { id: gymRes.data.id, name: gymRes.data.name, slug: gymRes.data.slug };
    } else {
      // We have the gymId from the gate but need the display fields.
      const { data: row, error: rowErr } = await supabase
        .from('gyms')
        .select('id, name, slug')
        .eq('id', resolvedGymId)
        .maybeSingle();
      if (rowErr) {
        logError(rowErr, { action: 'coaches.gym_row', userId, gymId: resolvedGymId });
        return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
      }
      resolvedGymRow = row as { id: string; name: string; slug: string };
    }

    const coaches = await listCoachesForGym(supabase, resolvedGymId);
    if (!coaches.success) {
      logError(new Error(coaches.error ?? 'unknown'), {
        action: 'coaches.list',
        userId,
        gymId: resolvedGymId,
      });
      return NextResponse.json({ success: false, error: coaches.error ?? 'list_failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        gym: resolvedGymRow,
        coaches: coaches.data ?? [],
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/coaches' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
