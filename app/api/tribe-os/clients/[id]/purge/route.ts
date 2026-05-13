/**
 * POST /api/tribe-os/clients/[id]/purge
 *
 * GDPR-style hard delete. Drops the client + cascades attendance,
 * training-partner edges (both sides), team memberships, and
 * insight-member links. Irreversible.
 *
 * Use the soft DELETE /api/tribe-os/clients/[id] route for "remove
 * from active roster"; use this one when a member exercises their
 * right to data wipe under GDPR / CCPA / similar.
 *
 * Auth:
 *   - Tribe.OS premium gate (caller must be a coach in this gym)
 *   - Owner-only — non-owner coaches can soft-archive but not hard-
 *     purge. This is a destructive action with legal implications;
 *     it stays gated to the gym owner who has clearest accountability.
 *
 * Response: { success: true } on hard-delete success.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError, log } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { getClient, purgeClient } from '@/lib/dal/clients';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    // Resolve gym + verify caller is the owner. Soft-archive is open
    // to any coach; hard-purge is owner-only because it's destructive
    // and legally consequential.
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    if (gymRes.data.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    // Verify the client exists + belongs to this gym BEFORE deleting,
    // so we never blast someone else's row even if RLS misbehaves.
    const clientRes = await getClient(supabase, clientId);
    if (!clientRes.success) {
      return NextResponse.json({ success: false, error: clientRes.error ?? 'lookup_failed' }, { status: 500 });
    }
    if (!clientRes.data) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }
    if (clientRes.data.gym_id !== gymRes.data.id) {
      return NextResponse.json({ success: false, error: 'wrong_gym' }, { status: 403 });
    }

    const result = await purgeClient(supabase, clientId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'purge_failed' }, { status: 500 });
    }

    log('info', 'tribe_os_client_purged', {
      action: 'clientPurged',
      clientId,
      gymId: gymRes.data.id,
      actorUserId: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/clients/[id]/purge' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
