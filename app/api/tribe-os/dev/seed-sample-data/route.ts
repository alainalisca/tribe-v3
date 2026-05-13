/**
 * POST /api/tribe-os/dev/seed-sample-data
 *
 * Dev-only sample-data seed. Drops 10 sample clients + 12 sessions
 * (3 series × 4 instances) + ~50 attendance rows into the caller's
 * gym so they can demo Tribe.OS end-to-end without manually typing
 * 50 attendance entries.
 *
 * Guarded by:
 *   - Tribe.OS premium gate (caller must own a gym)
 *   - Owner-only (we never let a non-owner coach mutate the gym)
 *   - Env flag ALLOW_SAMPLE_DATA_SEED=true (production-locked by
 *     default; only set this in your local + staging envs)
 *   - The seeder itself refuses to run when the gym already has
 *     any non-archived clients
 *
 * After a successful seed, the user can:
 *   1. Open /os/dashboard to see populated KPIs / activity feed
 *   2. Open /os/members to browse the seeded roster
 *   3. Open /os/intelligence and click "Run intelligence engine"
 *      to score the dataset → all 4 insight types should emit
 *
 * Cleanup (manual SQL):
 *   DELETE FROM clients WHERE 'sample-data' = ANY(tags);
 *   -- cascades to client_attendance via ON DELETE
 *   DELETE FROM sessions WHERE description = 'Sample data — generated for demo purposes.';
 */

import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { seedGymData } from '@/lib/sample-data/seedGymData';
import { getGym, getGymForUser } from '@/lib/dal/gyms';

export async function POST(): Promise<NextResponse> {
  // Env gate: refuse outright unless the deployer has opted in.
  // This is the production safety: a curious user can't accidentally
  // call this against a real gym.
  if (process.env.ALLOW_SAMPLE_DATA_SEED !== 'true') {
    return NextResponse.json({ success: false, error: 'seed_disabled' }, { status: 404 });
  }

  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    // Resolve the caller's gym (gym-context path first, owner-lookup
    // fallback for legacy sessions). Same pattern as /api/tribe-os/gym.
    const resolved = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!resolved.success || !resolved.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    const gym = resolved.data;
    if (gym.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    const summary = await seedGymData(gym.id, userId);
    if (summary.skipped_reason === 'existing_clients') {
      return NextResponse.json({ success: false, error: 'existing_clients', data: summary }, { status: 409 });
    }
    if (summary.clients_created === 0) {
      return NextResponse.json(
        { success: false, error: summary.skipped_reason ?? 'seed_failed', data: summary },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/dev/seed-sample-data' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
