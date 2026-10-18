/**
 * POST /api/sessions/[id]/guest (T-JOIN1 Part B): a guest asks for a spot
 * with a name and a WhatsApp number. The one door for every guest join (the
 * session page's "Pedir mi cupo" and the invite page's guest form).
 *
 * In order:
 *   1. the name (1 to 80 characters) and the phone, normalised to E.164 by
 *      lib/guestPhone.ts (a Colombian mobile or an international number with
 *      its country code). A typo is refused here and costs no attempt.
 *   2. 5 joins per IP per hour (rate_limits, the house limiter).
 *   3. one join per phone per session, checked here so it holds before
 *      migration 221 too; 221 enforces it again under the session lock.
 *   4. join_session_as_guest with the service role. After 221 only the service
 *      role may call it, so this route's limit cannot be skipped.
 *   5. the host's notification (notifyHost.ts), in-app and push.
 *
 * Body: { name, phone, inviteToken? }. The email field is gone from the form;
 * the column stays and is sent empty.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { normalizeGuestPhone } from '@/lib/guestPhone';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { notifyHostOfGuest } from './notifyHost';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { 'Cache-Control': 'private, no-store' };
export const GUEST_JOINS_PER_IP_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

const fail = (status: number, error: string) =>
  NextResponse.json({ success: false, error }, { status, headers: PRIVATE });

/** What the RPC's refusals mean to the browser. */
const RPC_ERRORS: Record<string, [number, string]> = {
  'Session is full': [409, 'session_full'],
  already_joined: [409, 'already_joined'],
  invalid_phone: [400, 'invalid_phone'],
  guest_details_required: [400, 'guest_details_required'],
  session_not_found: [404, 'session_not_found'],
  session_cancelled: [409, 'session_cancelled'],
  invite_required: [403, 'invite_required'],
  invite_invalid: [403, 'invite_invalid'],
  invite_expired: [403, 'invite_expired'],
  invite_not_for_you: [403, 'invite_not_for_you'],
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return fail(400, 'invalid_session');

  let body: { name?: unknown; phone?: unknown; inviteToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, 'invalid_json');
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 80) return fail(400, 'invalid_name');
  const phone = normalizeGuestPhone(typeof body.phone === 'string' ? body.phone : null);
  if (!phone) return fail(400, 'invalid_phone');
  const inviteToken =
    typeof body.inviteToken === 'string' && body.inviteToken.length > 0 && body.inviteToken.length <= 200
      ? body.inviteToken
      : null;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const service = getServiceRoleClient();
  const { allowed } = await checkRateLimit(service, `guest-join:${ip}`, GUEST_JOINS_PER_IP_PER_HOUR, HOUR_MS);
  if (!allowed) return fail(429, 'rate_limited');

  try {
    const { data: existing, error: dupError } = await service
      .from('session_participants')
      .select('id')
      .eq('session_id', id)
      .eq('is_guest', true)
      .eq('guest_phone', phone)
      .limit(1);
    if (dupError) logError(dupError, { action: 'guestJoin.dedupe', sessionId: id });
    if (existing && existing.length > 0) return fail(409, 'already_joined');

    const { data, error } = await service.rpc('join_session_as_guest', {
      p_session_id: id,
      p_invite_token: inviteToken,
      p_guest_name: name,
      p_guest_phone: phone,
      p_guest_email: null,
    });
    if (error) {
      logError(error, { action: 'guestJoin.rpc', sessionId: id });
      return fail(500, 'join_failed');
    }
    const result = (typeof data === 'string' ? JSON.parse(data) : data) as {
      success?: boolean;
      error?: string;
      participant_id?: string;
      guest_token?: string | null;
      status?: string;
    } | null;
    if (!result?.success) {
      const [status, code] = RPC_ERRORS[result?.error ?? ''] ?? [400, 'join_failed'];
      return fail(status, code);
    }
    // The host learns of the request here, on the server (it never throws).
    await notifyHostOfGuest(service, id, name);
    return NextResponse.json(
      {
        success: true,
        participant_id: result.participant_id,
        guest_token: result.guest_token ?? null,
        status: result.status,
      },
      { headers: PRIVATE }
    );
  } catch (error) {
    logError(error, { action: 'guestJoin', sessionId: id });
    return fail(500, 'join_failed');
  }
}
