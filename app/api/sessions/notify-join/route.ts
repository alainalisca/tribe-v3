/**
 * POST /api/sessions/notify-join
 *
 * Fires the "someone joined your session" push to a session's host.
 *
 * Why this route exists: /api/notifications/send is internal-only (it can
 * push arbitrary title/body to any user, so a logged-in user must never
 * reach it directly — that was a spoofing vector). The in-app join flows
 * still need to notify the host, so they call this narrow route instead.
 * Here the recipient (the session's creator) and the message text are
 * derived SERVER-SIDE from the session row; the client only supplies the
 * session id, a display name, and the join kind. The worst a caller can
 * do is trigger a fixed-format "X joined your session" ping to that
 * session's own host — not arbitrary content to an arbitrary user.
 *
 * Anti-abuse:
 *  - Registered joins (kind !== 'guest') require an authenticated user who
 *    is actually a participant of the session (verified server-side).
 *  - Guests have no session to verify against; that path is rate-limited
 *    and still fully server-templated, so the residual risk is a host
 *    getting a spurious benign "a guest joined" ping for their own session.
 *  - Both paths are rate-limited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { log, logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { notificationCopy, toLang } from '@/lib/notification-i18n';
import { createNotification } from '@/lib/dal';

const schema = z.object({
  session_id: z.string().uuid(),
  joiner_name: z.string().min(1).max(80),
  kind: z.enum(['join', 'request', 'guest']),
});

/**
 * Drop C0 control chars + DEL from a display name before it goes into a
 * fixed server template. Codepoint filter (not a control-char regex
 * literal) keeps the source free of untypeable bytes.
 */
function sanitizeName(raw: string): string {
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp > 0x1f && cp !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, 80);
  return cleaned || 'Someone';
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
    const { session_id, joiner_name, kind } = parsed.data;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Registered joins must come from the authenticated joiner.
    if (kind !== 'guest' && !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceRoleClient();

    // Rate limit (rate_limits RLS denies non-service-role writes).
    const rlKey = user ? `notify-join:${user.id}` : `notify-join:guest:${session_id}`;
    const { allowed } = await checkRateLimit(service, rlKey, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const { data: session } = await service
      .from('sessions')
      .select('id, creator_id, sport, status')
      .eq('id', session_id)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }
    // Inactive session or self-notify: benign no-op, not an error.
    if (session.status !== 'active' || (user && session.creator_id === user.id)) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // Registered-join anti-abuse: the caller must actually be a participant
    // of the session they claim to have joined.
    if (kind !== 'guest' && user) {
      const { data: participant } = await service
        .from('session_participants')
        .select('id')
        .eq('session_id', session_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!participant) {
        return NextResponse.json({ success: false, error: 'Not a participant' }, { status: 403 });
      }
    }

    // Fetch the host's preferred language so the notification arrives in
    // their language, not the joiner's client-side locale.
    const { data: hostRow } = await service
      .from('users')
      .select('preferred_language')
      .eq('id', session.creator_id)
      .maybeSingle();
    const hostLang = toLang((hostRow as { preferred_language?: string | null } | null)?.preferred_language);

    const safeName = sanitizeName(joiner_name);
    const templateKey = kind === 'request' ? 'join_request' : kind === 'guest' ? 'join_guest' : 'join';
    const { title, body } = notificationCopy(templateKey, hostLang, { name: safeName, sport: session.sport });

    // Always create an in-app notification for the host so they learn about
    // the join via the bell/notifications panel regardless of whether push/
    // VAPID is configured. The service-role client bypasses RLS for the
    // server-side insert.
    //
    // IMPORTANT: `type` must be one of the values in the notifications.type
    // CHECK constraint. `templateKey` ('join' | 'join_request' | 'join_guest')
    // is ONLY used to select localized copy above — it must NOT be stored as
    // the type. All three join variants map to 'session_join', which is in the
    // allowed set and has an icon + session click-through in the notifications
    // page.
    const inAppResult = await createNotification(service, {
      recipient_id: session.creator_id,
      actor_id: user?.id ?? null,
      type: 'session_join',
      entity_type: 'session',
      entity_id: session_id,
      message: body,
    });
    if (!inAppResult.success) {
      // Non-fatal — push still fires; but log so we can detect DAL issues.
      logError(inAppResult.error, {
        route: '/api/sessions/notify-join',
        action: 'create_in_app_notification',
        session_id,
        host: session.creator_id,
      });
    }

    // Best-effort push (web/FCM). A delivery failure must not fail the join
    // UX — the host already has the in-app notification above.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (siteUrl && cronSecret) {
      fetch(`${siteUrl}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
        body: JSON.stringify({
          userId: session.creator_id,
          title,
          body,
          url: `/session/${session_id}`,
          data: { sessionId: session_id, type: 'join' },
        }),
      })
        .then(async (res) => {
          if (res.status === 404) {
            // 404 means the host has no push token — expected when VAPID
            // is not configured or the host never enabled push. Structured
            // warning so it is detectable in logs without being noisy.
            log('warn', 'notify-join: host has no push token — in-app notification delivered instead', {
              route: '/api/sessions/notify-join',
              action: 'push_no_token',
              session_id,
              host: session.creator_id,
              status: res.status,
            });
          } else if (!res.ok) {
            const detail = await res.text().catch(() => '');
            logError(new Error(`push dispatch failed: ${res.status} ${detail}`), {
              route: '/api/sessions/notify-join',
              action: 'push_failed',
              session_id,
            });
          }
        })
        .catch((err) => logError(err, { route: '/api/sessions/notify-join', action: 'dispatch', session_id }));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/sessions/notify-join' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
