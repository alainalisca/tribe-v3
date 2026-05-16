/**
 * POST /api/me/check-in
 *
 * Member-facing self check-in. The signed-in Tribe user marks
 * themselves attended for one of *today's* sessions at their gym.
 *
 * Why this endpoint exists: today the coach is the only person who
 * can record attendance, which means at the start of class the coach
 * is buried in a phone marking 30 people. Letting members tap "I'm
 * here" on /my-coach takes that load off the coach and gives the
 * member a small dopamine hit ("my training is being tracked") —
 * doubles as a stickiness lever for /my-coach.
 *
 * Trust model:
 *   - We use service-role internally (because client_attendance RLS
 *     is "coach owns it") but the DAL re-validates identity + scope:
 *       1. clients.email must match the authenticated user's email
 *       2. session.creator_id must match the gym owner
 *       3. session.date must equal "today" in the gym's timezone
 *   - All three checks happen in lib/dal/memberSelf.recordSelfCheckIn.
 *
 * Failure modes (mapped to HTTP):
 *   401 unauthorized           — no auth user
 *   400 invalid_input          — missing/bad client_id or session_id
 *   404 not_found              — client or session doesn't exist
 *   403 identity_mismatch /
 *       wrong_gym / wrong_day /
 *       archived_member        — caller can't check in here (today)
 *   500 db_error               — server-side
 *
 * Body: { client_id: string, session_id: string }
 * Response: { success: true, data: { created: boolean } }
 *   - `created: true` means a new attendance row was inserted
 *   - `created: false` means the row already existed (idempotent)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError, log } from '@/lib/logger';
import { recordSelfCheckIn, revokeSelfCheckIn } from '@/lib/dal/memberSelf';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * Rate-limit configuration for self check-in. 30 per hour gives a
 * comfortable ceiling above any plausible legitimate usage — a
 * member at a busy gym with sessions every 90 minutes maxes out
 * at ~10 check-ins a day, so 30/hour is 3x headroom on a
 * theoretical worst-case-legitimate burst. Catches scripted abuse
 * (spam-tapping to inflate streak across every session the gym
 * owner created today) without inconveniencing real members.
 *
 * The DAL already gates damage scope: even if rate-limit fails open,
 * the member can only mark today's sessions from their own gym, and
 * each (client, session) row is unique. So the worst-case impact of
 * a rate-limit bypass is "every session today gets a self check-in"
 * — annoying but bounded, and the coach can delete the spurious rows
 * via the existing attendance edit flow.
 */
const CHECK_IN_RATE_MAX = 30;
const CHECK_IN_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface CheckInBody {
  client_id?: unknown;
  session_id?: unknown;
}

// Errors that mean "you can't do this here today" vs. "we broke" vs.
// "doesn't exist". Keeps the route handler from leaking which-side-failed.
const FORBIDDEN_ERRORS = new Set(['identity_mismatch', 'wrong_gym', 'wrong_day', 'archived_member']);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    // Rate-limit per authenticated user (not per IP, not per device).
    // A member with two devices doesn't accidentally share their
    // bucket with anyone else, and an attacker rotating IPs can't
    // bypass the limit without compromising another auth token.
    // Run BEFORE body parsing so spam doesn't even get to JSON parse.
    //
    // Uses a dedicated service-role client because the rate_limits
    // table from migration 049 has RLS enabled with no policies —
    // only service-role can write to it. Matches the pattern in
    // /api/auth/signup. Falls open if env vars are missing (logged).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      // Rate limiting unavailable. Log it but allow through — the
      // DAL's existing identity + scope guards still contain the
      // damage envelope.
      log('warn', 'tribe_member_check_in_rate_limit_unavailable', {
        action: 'memberSelfCheckIn.rate_limit_misconfigured',
      });
    } else {
      const rateLimitClient = createServiceClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const rateKey = `checkin:${user.id}`;
      const rate = await checkRateLimit(rateLimitClient, rateKey, CHECK_IN_RATE_MAX, CHECK_IN_RATE_WINDOW_MS);
      if (!rate.allowed) {
        // Retry-After header in seconds — standard 429 contract.
        const retryAfterSeconds = Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000));
        log('warn', 'tribe_member_check_in_rate_limited', {
          action: 'memberSelfCheckIn.rate_limited',
          actorUserId: user.id,
          retry_after_seconds: retryAfterSeconds,
        });
        return NextResponse.json(
          { success: false, error: 'rate_limited', retry_after_seconds: retryAfterSeconds },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
        );
      }
    }

    let body: CheckInBody;
    try {
      body = (await request.json()) as CheckInBody;
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    if (!clientId || !sessionId) {
      return NextResponse.json({ success: false, error: 'invalid_input' }, { status: 400 });
    }

    const result = await recordSelfCheckIn(clientId, sessionId, user.email);
    if (!result.success) {
      const err = result.error ?? 'db_error';
      if (err === 'not_found') {
        return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
      }
      if (FORBIDDEN_ERRORS.has(err)) {
        return NextResponse.json({ success: false, error: err }, { status: 403 });
      }
      return NextResponse.json({ success: false, error: err }, { status: 500 });
    }

    // Light analytics breadcrumb. Coach-facing analytics happens at the
    // attendance trigger (touches counters); this log is just for the
    // member-facing surface so we can see adoption.
    log('info', 'tribe_member_self_checked_in', {
      action: 'memberSelfCheckIn',
      clientId,
      sessionId,
      created: result.data?.created ?? false,
      actorUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      data: { created: result.data?.created ?? false },
    });
  } catch (error) {
    logError(error, { route: 'POST /api/me/check-in' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

/**
 * DELETE /api/me/check-in
 *
 * Member-initiated undo of a check-in they made earlier today.
 * Flips `attended` to false on the existing row (doesn't delete
 * the row entirely — the coach may want to see the original tap
 * in case of disputes). Today-only by design; historical
 * corrections route through the coach.
 *
 * Body: { client_id: string, session_id: string }
 * Response: { success: true, data: { reverted: boolean } }
 *   - reverted:true means the attended flag was flipped
 *   - reverted:false means the row was already attended:false
 *     (idempotent no-op)
 *
 * Uses the same FORBIDDEN_ERRORS set as POST for HTTP mapping, plus
 * not_attended (the row exists but was never attended:true) which
 * comes back as 409 since it's a state conflict.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    let body: CheckInBody;
    try {
      body = (await request.json()) as CheckInBody;
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    if (!clientId || !sessionId) {
      return NextResponse.json({ success: false, error: 'invalid_input' }, { status: 400 });
    }

    const result = await revokeSelfCheckIn(clientId, sessionId, user.email);
    if (!result.success) {
      const err = result.error ?? 'db_error';
      if (err === 'not_found') {
        return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
      }
      if (err === 'not_attended') {
        return NextResponse.json({ success: false, error: 'not_attended' }, { status: 409 });
      }
      if (FORBIDDEN_ERRORS.has(err)) {
        return NextResponse.json({ success: false, error: err }, { status: 403 });
      }
      return NextResponse.json({ success: false, error: err }, { status: 500 });
    }

    log('info', 'tribe_member_self_check_in_undone', {
      action: 'memberSelfCheckIn.revoked',
      clientId,
      sessionId,
      reverted: result.data?.reverted ?? false,
      actorUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      data: { reverted: result.data?.reverted ?? false },
    });
  } catch (error) {
    logError(error, { route: 'DELETE /api/me/check-in' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
