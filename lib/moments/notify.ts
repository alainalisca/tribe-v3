import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/dal/notifications';
import { publicSessionTitle } from '@/lib/share/sessionPublic';
import { log, logError } from '@/lib/logger';

/**
 * T-MOM1: the one notification a person gets when a batch is delivered:
 * "Tienes 6 fotos nuevas de Boxeo con Salomon". In-app (the bell) and push
 * through /api/notifications/send with type moments_delivered, which honours
 * the person's session-updates preference. The deep link is the session for
 * now; Part C points it at the person's Momentos.
 */
export function momentsMessage(count: number, title: string, lang: 'es' | 'en'): string {
  if (lang === 'en')
    return count === 1 ? `You have 1 new photo from ${title}` : `You have ${count} new photos from ${title}`;
  return count === 1 ? `Tienes 1 foto nueva de ${title}` : `Tienes ${count} fotos nuevas de ${title}`;
}

export function makeMomentsNotifier(
  service: SupabaseClient,
  args: {
    sessionId: string;
    actorId: string;
    session: { title: string | null; sport: string | null; creatorName: string | null };
  }
) {
  return async (userId: string, count: number): Promise<void> => {
    const { data: u } = await service.from('users').select('preferred_language').eq('id', userId).maybeSingle();
    const lang = (u as { preferred_language?: string | null } | null)?.preferred_language === 'en' ? 'en' : 'es';
    const title = publicSessionTitle(args.session, lang);
    const message = momentsMessage(count, title, lang);
    const url = `/session/${args.sessionId}/`;
    const inApp = await createNotification(service, {
      recipient_id: userId,
      actor_id: args.actorId,
      type: 'moments_delivered',
      entity_type: 'session',
      entity_id: args.sessionId,
      message,
      action_url: url,
    });
    if (!inApp.success) logError(inApp.error, { action: 'moments.notify.inApp', sessionId: args.sessionId });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const cronSecret = process.env.CRON_SECRET;
    if (!siteUrl || !cronSecret) return;
    const res = await fetch(`${siteUrl}/api/notifications/send/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
      body: JSON.stringify({
        userId,
        title: lang === 'en' ? 'New photos' : 'Fotos nuevas',
        body: message,
        url,
        type: 'moments_delivered',
        data: { sessionId: args.sessionId, type: 'moments_delivered' },
      }),
    }).catch((e) => {
      logError(e, { action: 'moments.notify.push', sessionId: args.sessionId });
      return null;
    });
    if (res && res.status === 404) log('info', 'moments: no push token, in-app only', { sessionId: args.sessionId });
  };
}
