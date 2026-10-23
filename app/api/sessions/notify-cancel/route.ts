/**
 * POST /api/sessions/notify-cancel
 *
 * Pushes "your session was cancelled" to the athletes who were confirmed in a
 * session that the host (or an admin) just cancelled. PUSH ONLY, like
 * notify-approval.
 *
 * Why a route: cancelSession runs in the browser, and it used to call
 * /api/notifications/send itself with `Bearer ${process.env.CRON_SECRET}`. That
 * variable is not public, so in the browser it was undefined, the send route
 * answered 401, and no cancel push was ever delivered. The secret stays here.
 *
 * Anti-spoofing: the client sends ONLY the session id and the participant row
 * ids it read before cancelling (after the cancel, every row of the session is
 * 'cancelled', so the server cannot tell on its own who was confirmed). It
 * never names a recipient and never supplies text. Recipients are the user_ids
 * of those rows, and only rows that belong to this session count.
 *
 * Security boundary (else 401/403/409, with no detail):
 *   1. caller is authenticated
 *   2. caller is the session's creator, or an admin (is_app_admin), the same
 *      people who can cancel it
 *   3. the session is already cancelled, so the text is true and this cannot
 *      be used to ping the athletes of a live session
 *   4. recipients = user_id of the named rows WHERE session_id matches, minus
 *      guest rows (no account) and the creator
 * The worst a caller can do is re-send the fixed cancel notice for their own
 * cancelled session; the rate limit bounds that.
 *
 * Sending: lib/notify/sessionCancelledPush.ts (T-DEL1 moved it there so an
 * account deletion that cancels a host's sessions sends the same notice):
 * each recipient's language, /api/notifications/send, type 'session_cancelled'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { log, logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendSessionCancelledPush, type CancelledSession } from '@/lib/notify/sessionCancelledPush';

const ROUTE = '/api/sessions/notify-cancel';

const schema = z.object({
  session_id: z.string().uuid(),
  participant_ids: z.array(z.string().uuid()).min(1).max(500),
});

interface SessionRow extends CancelledSession {
  status: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }
    const { session_id, participant_ids } = parsed.data;

    // (1) Caller must be authenticated.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceRoleClient();

    // Ending a series cancels each future occurrence, one call each, so the
    // limit is per minute and roomy.
    const { allowed } = await checkRateLimit(service, `notify-cancel:${user.id}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { data: sessionRaw } = await service
      .from('sessions')
      .select('id, creator_id, status, title, sport, date, is_paid')
      .eq('id', session_id)
      .maybeSingle();
    const session = sessionRaw as SessionRow | null;
    if (!session) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // (2) Host or admin. is_app_admin only ever answers for the caller.
    if (session.creator_id !== user.id) {
      const { data: isAdmin } = await supabase.rpc('is_app_admin');
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // (3) Only after the cancel has landed.
    if (session.status !== 'cancelled') {
      return NextResponse.json({ success: false, error: 'Session is not cancelled' }, { status: 409 });
    }

    // (4) Recipients from the named rows of THIS session only.
    const { data: rowsRaw } = await service
      .from('session_participants')
      .select('id, user_id')
      .eq('session_id', session_id)
      .in('id', participant_ids);
    const recipients = [
      ...new Set(
        ((rowsRaw ?? []) as Array<{ user_id: string | null }>)
          .map((r) => r.user_id)
          .filter((id): id is string => !!id && id !== session.creator_id)
      ),
    ];
    if (recipients.length === 0) {
      return NextResponse.json({ success: true, sent: 0, suppressed: 0, no_token: 0, failed: 0 });
    }

    const result = await sendSessionCancelledPush(service, session, recipients, ROUTE);
    if (result.skipped) return NextResponse.json({ success: true, skipped: true });
    const summary = {
      sent: result.sent,
      suppressed: result.suppressed,
      no_token: result.no_token,
      failed: result.failed,
    };
    log('info', 'notify-cancel dispatched', { route: ROUTE, action: 'dispatched', session_id, ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logError(error, { route: ROUTE });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
