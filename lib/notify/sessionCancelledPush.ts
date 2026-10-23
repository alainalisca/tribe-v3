import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { notificationCopy } from '@/lib/notification-i18n';
import { publicSessionTitle } from '@/lib/share/sessionPublic';
import { cancelDate } from '@/app/api/sessions/notify-cancel/copy';
import { recipientLanguage, type LanguagePreference } from '@/lib/i18n/recipientLanguage';

/**
 * The "your session was cancelled" push, sent to the athletes of a session
 * that is already cancelled. Moved here unchanged from
 * /api/sessions/notify-cancel (T-DEL1) so the two places a session is
 * cancelled on someone's behalf send the same notice: the host or an admin
 * cancelling it, and the host's account being deleted
 * (lib/account/deleteAccount). Callers choose the recipients; this only sends.
 *
 * Language: lib/i18n/recipientLanguage.ts (the stored choice, else Spanish).
 * Delivery: /api/notifications/send with type 'session_cancelled', so the
 * recipient's session-updates push preference decides.
 */

export interface CancelledSession {
  id: string;
  creator_id: string;
  title: string | null;
  sport: string | null;
  date: string | null;
  is_paid: boolean | null;
}

type Outcome = 'sent' | 'suppressed' | 'no_token' | 'failed';
export type CancelPushSummary = Record<Outcome, number>;

const TYPE = 'session_cancelled';

export const NO_CANCEL_PUSHES: CancelPushSummary = { sent: 0, suppressed: 0, no_token: 0, failed: 0 };

export async function sendSessionCancelledPush(
  service: SupabaseClient,
  session: CancelledSession,
  recipients: string[],
  route: string
): Promise<CancelPushSummary & { skipped?: true }> {
  if (recipients.length === 0) return { ...NO_CANCEL_PUSHES };
  const session_id = session.id;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const cronSecret = process.env.CRON_SECRET;
  if (!siteUrl || !cronSecret) {
    logError(new Error('missing NEXT_PUBLIC_SITE_URL or CRON_SECRET'), {
      route,
      action: 'config_missing',
      session_id,
    });
    return { ...NO_CANCEL_PUSHES, skipped: true };
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
            route,
            action: 'push_failed',
            session_id,
            recipient: userId,
          });
          return 'failed';
        }
        const json = (await res.json().catch(() => null)) as { suppressed?: boolean } | null;
        return json?.suppressed ? 'suppressed' : 'sent';
      } catch (err) {
        logError(err, { route, action: 'dispatch', session_id, recipient: userId });
        return 'failed';
      }
    })
  );

  const count = (o: Outcome) => outcomes.filter((x) => x === o).length;
  return { sent: count('sent'), suppressed: count('suppressed'), no_token: count('no_token'), failed: count('failed') };
}
