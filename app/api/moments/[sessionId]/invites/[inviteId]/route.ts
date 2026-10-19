import { NextResponse } from 'next/server';
import { guardMomentsManager, PRIVATE, fail } from '@/lib/moments/routeGuard';
import { normalizeGuestPhone } from '@/lib/guestPhone';
import { logError } from '@/lib/logger';

/**
 * PATCH /api/moments/<session>/invites/<invite>/ (T-MOM1): add or change the
 * WhatsApp number of an invite (a "Quién llegó" name has none), so the claim
 * link can be sent. Not on a claimed invite.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ sessionId: string; inviteId: string }> }) {
  const { sessionId, inviteId } = await params;
  const g = await guardMomentsManager(sessionId);
  if (!g.ok) return g.res;
  const raw = (await req.json().catch(() => null)) as { phone?: unknown } | null;
  const phone = normalizeGuestPhone(typeof raw?.phone === 'string' ? raw.phone : null);
  if (!phone) return fail(400, 'invalid_phone');
  try {
    const { data, error } = await g.service
      .from('media_invites')
      .update({ phone })
      .eq('id', inviteId)
      .eq('session_id', sessionId)
      .is('claimed_by', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return fail(404, 'not_found');
    return NextResponse.json({ id: inviteId, hasPhone: true }, { headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.invitePhone', sessionId });
    return fail(500, 'update_failed');
  }
}
