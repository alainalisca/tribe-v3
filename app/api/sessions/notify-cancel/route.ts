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
 * Language: lib/i18n/recipientLanguage.ts (the stored choice, else Spanish).
 * Delivery: /api/notifications/send with type 'session_cancelled', so the
 * recipient's session-updates push preference decides.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { log, logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { notificationCopy } from '@/lib/notification-i18n';
import { publicSessionTitle } from '@/lib/share/sessionPublic';
import { cancelDate } from './copy';
import { recipientLanguage, type LanguagePreference } from '@/lib/i18n/recipientLanguage';

const ROUTE = '/api/sessions/notify-cancel';
const TYPE = 'session_cancelled';

const schema = z.object({
  session_id: z.string().uuid(),
  participant_ids: z.array(z.string().uuid()).min(1).max(500),
});

interface SessionRow {
  id: string;
  creator_id: string;
  status: string | null;
  title: string | null;
  sport: string | null;
  date: string | null;
  is_paid: boolean | null;
}

type Outcome = 'sent' | 'suppressed' | 'no_token' | 'failed';

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!siteUrl || !cronSecret) {
      logError(new Error('missing NEXT_PUBLIC_SITE_URL or CRON_SECRET'), {
        route: ROUTE,
        action: 'config_missing',
        session_id,
      });
      return NextResponse.json({ success: true, skipped: true });
    }

    const { data: langRows } = await service
      .from('users')
      .select('id, preferred_language, preferred_language_set_at')
      .in('id', recipients);
    const langOf = new Map(
      ((langRows ?? []) as Array<{ id: string } & LanguagePreference>).map((u) => [u.id, recipientLanguage(u)])
    );

    // "<Deporte> con <Nombre>" when the session has no title.
    let hostName: string | null = null;
    if (!session.title?.trim()) {
      const { data: host } = await service.from('users').select('name').eq('id', session.creator_id).maybeSingle();
      hostName = (host as { name?: string | null } | null)?.name ?? null;
    }

    const key = session.is_paid ? 'session_cancelled_paid' : 'session_cancelled';
    const url = `/session/${session_id}/`;

    // Awaited: work started after a serverless response may be killed. One
    // recipient's failure never stops the others, and nothing here touches the
    // cancel, which has already happened.
    const outcomes = await Promise.all(
      recipients.map(async (userId): Promise<Outcome> => {
        const lang = langOf.get(userId) ?? 'es';
        const { title, body } = notificationCopy(key, lang, {
          session: publicSessionTitle({ title: session.title, sport: session.sport, creatorName: hostName }, lang),
          date: session.date ? cancelDate(session.date, lang) : '',
        });
        try {
          // Trailing slash: next.config sets trailingSlash, the bare path 308s.
          const res = await fetch(`${siteUrl}/api/notifications/send/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
            body: JSON.stringify({
              userId,
              title,
              body,
              url,
              type: TYPE,
              data: { sessionId: session_id, type: TYPE },
            }),
          });
          // 404: the athlete has no push token. Expected, not an error.
          if (res.status === 404) return 'no_token';
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            logError(new Error(`push dispatch failed: ${res.status} ${detail}`), {
              route: ROUTE,
              action: 'push_failed',
              session_id,
              recipient: userId,
            });
            return 'failed';
          }
          const json = (await res.json().catch(() => null)) as { suppressed?: boolean } | null;
          return json?.suppressed ? 'suppressed' : 'sent';
        } catch (err) {
          logError(err, { route: ROUTE, action: 'dispatch', session_id, recipient: userId });
          return 'failed';
        }
      })
    );

    const count = (o: Outcome) => outcomes.filter((x) => x === o).length;
    const summary = {
      sent: count('sent'),
      suppressed: count('suppressed'),
      no_token: count('no_token'),
      failed: count('failed'),
    };
    log('info', 'notify-cancel dispatched', { route: ROUTE, action: 'dispatched', session_id, ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logError(error, { route: ROUTE });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
