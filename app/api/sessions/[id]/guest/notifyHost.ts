import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/dal';
import { log, logError } from '@/lib/logger';
import { notificationCopy } from '@/lib/notification-i18n';
import { recipientLanguage, type LanguagePreference } from '@/lib/i18n/recipientLanguage';

/**
 * T-JOIN1 Part B: tell the host a guest asked for a spot, from the guest route
 * after the join succeeded. Before this the browser called
 * /api/sessions/notify-join, which middleware sends to /auth for anyone not
 * signed in, so no guest join ever reached a host. Here the recipient (the
 * session's creator) and the words are fixed on the server, the same as that
 * route's guest path: an in-app notification, then a best-effort push.
 * Never throws; a failed ping must not fail the join.
 */
export async function notifyHostOfGuest(service: SupabaseClient, sessionId: string, guestName: string): Promise<void> {
  try {
    const { data: session } = await service
      .from('sessions')
      .select('creator_id, sport, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (!session?.creator_id || session.status !== 'active') return;

    const { data: host } = await service
      .from('users')
      .select('preferred_language, preferred_language_set_at')
      .eq('id', session.creator_id)
      .maybeSingle();
    const hostLang = recipientLanguage(host as LanguagePreference | null);
    const { title, body } = notificationCopy('join_guest', hostLang, { name: guestName, sport: session.sport });

    const inApp = await createNotification(service, {
      recipient_id: session.creator_id,
      actor_id: null,
      type: 'session_join',
      entity_type: 'session',
      entity_id: sessionId,
      message: body,
    });
    if (!inApp.success) logError(inApp.error, { action: 'guestJoin.notifyHost.inApp', sessionId });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!siteUrl || !cronSecret) return;
    const res = await fetch(`${siteUrl}/api/notifications/send/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
      body: JSON.stringify({
        userId: session.creator_id,
        title,
        body,
        url: `/session/${sessionId}/`,
        data: { sessionId, type: 'join' },
      }),
    });
    if (res.status === 404) {
      log('warn', 'guest join: host has no push token, in-app notification delivered instead', {
        action: 'guestJoin.notifyHost.noToken',
        sessionId,
      });
    } else if (!res.ok) {
      logError(new Error(`push dispatch failed: ${res.status}`), { action: 'guestJoin.notifyHost.push', sessionId });
    }
  } catch (error) {
    logError(error, { action: 'guestJoin.notifyHost', sessionId });
  }
}
