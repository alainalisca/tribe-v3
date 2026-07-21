/**
 * POST /api/sessions/notify-approval
 *
 * Sends a push to an athlete whose pending join request was just approved by the
 * session's host ("You're in!"). PUSH ONLY — both approve call sites already create
 * the in-app bell, so creating one here would double it.
 *
 * Why a separate route from notify-join: notify-join's whole contract is "notify the
 * session's HOST", and every one of its guards is written around recipient =
 * session.creator_id (including a `caller is creator -> skip` no-op). Approval
 * inverts BOTH the recipient (the athlete) and the authorization (only the creator
 * may trigger it). Forking that logic inside notify-join is where a subtle auth bug
 * would hide, so this route keeps its own clean, inverted contract and notify-join is
 * left untouched.
 *
 * Anti-spoofing: the client sends ONLY session_id + participant_id (the pending row
 * it already holds). It never names the recipient and never supplies message text —
 * both are derived server-side. The worst a caller can do is re-trigger a fixed
 * "request approved" ping for a row they already approved on their own session.
 *
 * Security boundary (all five must pass, else 403):
 *   1. caller is authenticated
 *   2. participant row exists and its session_id matches the body's session_id
 *   3. that row's status is 'confirmed'
 *   4. the caller is the creator_id of that session
 *   5. only then: recipient = that row's user_id
 * A single missing check turns this into a push-anyone abuse vector, so failures are
 * deliberately indistinguishable (403, no detail) rather than leaking row existence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { log, logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { notificationCopy, toLang } from '@/lib/notification-i18n';

const schema = z.object({
  session_id: z.string().uuid(),
  participant_id: z.string().uuid(),
});

interface ParticipantRow {
  id: string;
  session_id: string;
  user_id: string | null;
  status: string | null;
}

interface SessionRow {
  id: string;
  creator_id: string;
  status: string | null;
  title: string | null;
  sport: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }
    const { session_id, participant_id } = parsed.data;

    // (1) Caller must be authenticated.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceRoleClient();

    // Rate limit (rate_limits RLS denies non-service-role writes).
    const { allowed } = await checkRateLimit(service, `notify-approval:${user.id}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    // (2)(3) The participant row must exist, belong to the session named in the
    // body, and already be confirmed. Read with service-role: the host cannot see
    // another user's participant row under the narrow RLS SELECT policy.
    const { data: participantRaw } = await service
      .from('session_participants')
      .select('id, session_id, user_id, status')
      .eq('id', participant_id)
      .maybeSingle();
    const participant = participantRaw as ParticipantRow | null;

    if (!participant || participant.session_id !== session_id || participant.status !== 'confirmed') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // (4) Only the session's creator may trigger an approval push.
    const { data: sessionRaw } = await service
      .from('sessions')
      .select('id, creator_id, status, title, sport')
      .eq('id', session_id)
      .maybeSingle();
    const session = sessionRaw as SessionRow | null;

    if (!session || session.creator_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // (5) Recipient is the approved athlete. Guest rows have no user_id and no
    // account to push to — benign no-op, not an error.
    const recipientId = participant.user_id;
    if (!recipientId) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // Compose in the ATHLETE's language (not the host's UI locale).
    const { data: recipientRaw } = await service
      .from('users')
      .select('preferred_language')
      .eq('id', recipientId)
      .maybeSingle();
    const recipientLang = toLang((recipientRaw as { preferred_language?: string | null } | null)?.preferred_language);

    const sessionLabel = session.title || session.sport || '';
    const { title, body } = notificationCopy('request_approved', recipientLang, { session: sessionLabel });

    // Push only — the bell is created by the approve call sites.
    //
    // Trailing slash is deliberate: next.config sets trailingSlash: true, so the
    // un-slashed path 308-redirects. Posting straight to the canonical URL avoids
    // depending on redirect behaviour for the body.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!siteUrl || !cronSecret) {
      logError(new Error('missing NEXT_PUBLIC_SITE_URL or CRON_SECRET'), {
        route: '/api/sessions/notify-approval',
        action: 'config_missing',
        session_id,
      });
      return NextResponse.json({ success: true, skipped: true });
    }

    // Awaited (unlike notify-join's fire-and-forget): work started after a
    // serverless response may be killed before it completes, and this push is the
    // entire point of the route. Delivery failure is non-fatal — the athlete still
    // has the in-app bell from the call site.
    try {
      const res = await fetch(`${siteUrl}/api/notifications/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({
          userId: recipientId,
          title,
          body,
          url: `/session/${session_id}`,
          data: { sessionId: session_id, type: 'request_approved' },
        }),
      });
      if (res.status === 404) {
        // The athlete has no push token (never enabled push / no device). Expected,
        // not an error — structured warn so it is detectable without being noisy.
        log('warn', 'notify-approval: athlete has no push token — in-app bell delivered instead', {
          route: '/api/sessions/notify-approval',
          action: 'push_no_token',
          session_id,
          recipient: recipientId,
          status: res.status,
        });
      } else if (!res.ok) {
        const detail = await res.text().catch(() => '');
        logError(new Error(`push dispatch failed: ${res.status} ${detail}`), {
          route: '/api/sessions/notify-approval',
          action: 'push_failed',
          session_id,
          recipient: recipientId,
        });
      }
    } catch (err) {
      logError(err, { route: '/api/sessions/notify-approval', action: 'dispatch', session_id });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/sessions/notify-approval' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
