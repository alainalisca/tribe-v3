/**
 * POST /api/tribe-os/dev/cleanup-sample-data
 *
 * Companion to /api/tribe-os/dev/seed-sample-data. Removes every
 * sample-data row this gym ever had: clients tagged 'sample-data',
 * their attendance + training-partner edges (via ON DELETE CASCADE),
 * sample sessions, and any insights that referenced only sample
 * clients.
 *
 * Same gate as the seeder:
 *   - Tribe.OS premium + owner-only
 *   - Env flag ALLOW_SAMPLE_DATA_SEED=true
 *
 * Real data is never at risk — the cleanup filters strictly to
 * sample tags / marker descriptions / sample-only insights, never
 * to "everything in this gym."
 */

import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { cleanupGymSampleData } from '@/lib/sample-data/seedGymData';
import { getGym, getGymForUser } from '@/lib/dal/gyms';

export async function POST(): Promise<NextResponse> {
  if (process.env.ALLOW_SAMPLE_DATA_SEED !== 'true') {
    return NextResponse.json({ success: false, error: 'seed_disabled' }, { status: 404 });
  }

  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const resolved = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!resolved.success || !resolved.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    const gym = resolved.data;
    if (gym.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    const summary = await cleanupGymSampleData(gym.id);
    if (summary.skipped_reason) {
      return NextResponse.json({ success: false, error: summary.skipped_reason, data: summary }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/dev/cleanup-sample-data' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
