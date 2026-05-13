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
import { logError, log } from '@/lib/logger';
import { recordSelfCheckIn } from '@/lib/dal/memberSelf';

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
