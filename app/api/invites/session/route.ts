import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createNotification } from '@/lib/dal/notifications';
import { fetchSession } from '@/lib/dal/sessions';
import { insertInviteToken } from '@/lib/dal/invites';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { log, logError } from '@/lib/logger';
import { notificationCopy, toLang } from '@/lib/notification-i18n';

const inviteSchema = z.object({
  session_id: z.string().uuid(),
  recipient_user_id: z.string().uuid(),
});

/**
 * @description Sends a session invite notification to another athlete.
 * @method POST
 * @auth Required
 * @param {Object} request.body - { session_id: string, recipient_user_id: string }
 * @returns {{ success: boolean }}
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: max 10 invites per minute per user. Service-role client required (RLS).
    const { allowed } = await checkRateLimit(getServiceRoleClient(), `invite-session:${user.id}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many invites. Please wait a moment.' }, { status: 429 });
    }

    const raw = await request.json();
    const parsed = inviteSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
    }

    const { session_id, recipient_user_id } = parsed.data;

    if (recipient_user_id === user.id) {
      return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 });
    }

    // Validate session exists
    const sessionResult = await fetchSession(supabase, session_id);
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const session = sessionResult.data;

    // Validate: sender is creator or confirmed participant
    const isCreator = session.creator_id === user.id;
    if (!isCreator) {
      const { data: participation } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', session_id)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (!participation) {
        return NextResponse.json({ error: 'You must be the creator or a participant to invite' }, { status: 403 });
      }
    }

    // Check recipient is not already in session.
    //
    // THE ERROR IS CHECKED, not discarded. Destructuring only `data` meant a
    // FAILED query produced undefined, which read as "not already in the
    // session" and let the invite proceed -- so a transient database error
    // silently became a duplicate invite to someone already attending.
    const { data: existingParticipant, error: participantError } = await supabase
      .from('session_participants')
      .select('id')
      .eq('session_id', session_id)
      .eq('user_id', recipient_user_id)
      .maybeSingle();

    if (participantError) {
      logError(participantError, {
        route: '/api/invites/session',
        action: 'check_existing_participant',
        session_id,
      });
      return NextResponse.json({ error: 'Could not verify the invite. Please try again.' }, { status: 503 });
    }

    if (existingParticipant) {
      return NextResponse.json({ error: 'This athlete is already in the session' }, { status: 409 });
    }

    // Get sender name for notification message
    const { data: senderProfile } = await supabase.from('users').select('name').eq('id', user.id).single();
    const senderName = senderProfile?.name || 'Someone';

    // Service role client: RLS bypass for the notification insert, the
    // recipient language lookup, and the invite token mint.
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // T-INV1: mint an invite token so the in-app invite is acceptable through
    // the same /invite/{token} flow as shared links. expires_at is left to the
    // DB default (created_at + 7 days). Without a token the invite is a dead
    // end (invite_only sessions reject tokenless joins), so failure here fails
    // the request.
    const token = randomBytes(16).toString('hex');
    const tokenResult = await insertInviteToken(serviceSupabase, {
      session_id,
      token,
      created_by: user.id,
      // 185: ADDRESSED, not bearer. Without this the column exists, both join
      // paths enforce it, and it never fires on a single real invite -- every
      // card invite would stay a bearer token that anyone it was forwarded to
      // could accept.
      //
      // NULL stays meaningful and is NOT set here by accident: public share
      // links (migration 141) mint tokens with no recipient, and those keep
      // pre-185 behaviour on both paths. This route knows exactly who it is
      // inviting, so it says so.
      recipient_id: recipient_user_id,
    });
    if (!tokenResult.success) {
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
    }

    // T-INV1: compose the message in the RECIPIENT's language.
    const { data: recipientProfile } = await serviceSupabase
      .from('users')
      .select('preferred_language')
      .eq('id', recipient_user_id)
      .maybeSingle();
    const { title, body: message } = notificationCopy('session_invite', toLang(recipientProfile?.preferred_language), {
      name: senderName,
      sport: session.sport,
      date: session.date,
    });

    // action_url CARRIES THE TOKEN (migration 182). Until this existed the
    // token was minted, stored, and never delivered: entity_id is uuid and
    // cannot hold 32 hex characters, and nothing else on a notification could
    // carry it. The recipient got a message pointing at the SESSION, and an
    // invite_only session refuses a tokenless join -- the exact dead end the
    // mint was supposed to prevent.
    const inviteUrl = `/invite/${token}/`;

    const notifResult = await createNotification(serviceSupabase, {
      recipient_id: recipient_user_id,
      actor_id: user.id,
      type: 'session_invite',
      entity_type: 'session',
      entity_id: session_id,
      message,
      action_url: inviteUrl,
    });

    if (!notifResult.success) {
      return NextResponse.json({ error: notifResult.error || 'Failed to send invite' }, { status: 500 });
    }

    // PUSH. Without this the recipient only discovers the invite by opening the
    // app and looking at the bell -- which is indistinguishable from never
    // being invited, and is what "the invite did not reach the intended
    // person" actually was.
    //
    // `type` is supplied so /api/notifications/send gates the send on the
    // recipient's push preference for that category; it answers
    // { suppressed: true, reason: 'preference' } rather than sending when the
    // recipient has that category off. Title and body are already in the
    // RECIPIENT's language, and the url is the invite, not the session.
    //
    // Best-effort: a push failure must not fail the invite, because the in-app
    // notification above is already written and IS the invite.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (siteUrl && cronSecret) {
      fetch(`${siteUrl}/api/notifications/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({
          userId: recipient_user_id,
          title,
          body: message,
          url: inviteUrl,
          type: 'session_invite',
          data: { sessionId: session_id, type: 'session_invite' },
        }),
      }).catch((err) =>
        logError(err, {
          route: '/api/invites/session',
          action: 'push_invite',
          session_id,
          recipient: recipient_user_id,
        })
      );
    } else {
      // Silence here would be indistinguishable from a delivered push.
      log('warn', 'invite push skipped: NEXT_PUBLIC_SITE_URL or CRON_SECRET missing', {
        route: '/api/invites/session',
        action: 'push_skipped',
        session_id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/invites/session', action: 'send_session_invite' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
