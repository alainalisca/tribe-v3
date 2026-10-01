/**
 * T-AV27b. Turn what 8209 decided into the person's notification: the copy in
 * THEIR language (messages/*.json, "notify"), the in-app row, and, when the
 * database said the push is within the cap, one push through the
 * consolidated path, /api/notifications/send (never a DB trigger, parent spec
 * section 3). Nothing here decides WHETHER to notify; that is 8209's job.
 *
 * Log mode: /api/notifications/send short-circuits in lib/notify/sendMode
 * (PUSH_MODE=log, and always on a local stack), so on the athlete branch no
 * push leaves the machine. The call is made anyway, so the path exercised
 * locally is the path production takes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/dal/notifications';
import type { ClaimedNotification } from '@/lib/dal/athleteNotify';
import { log, logError } from '@/lib/logger';
import { toLanguage, translate } from '@/lib/i18n/translate';

export interface RenderedNotification {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  url: string;
  push: boolean;
  leadId: string | null;
}

/** The athlete's events open their home; the owner's open the gym dashboard. */
export function renderNotification(n: ClaimedNotification): RenderedNotification {
  const lang = toLanguage(n.language);
  const guest = n.guestFirstName ?? '';
  const body =
    n.event === 'arrived'
      ? translate(lang, 'notify', 'arrived', { guest })
      : n.event === 'joined'
        ? translate(lang, 'notify', 'joined', { guest, gym: n.partnerName })
        : n.event === 'claimed'
          ? translate(lang, 'notify', 'claimed', { guest })
          : translate(lang, 'notify', 'ready', { athlete: n.athleteFirstName ?? '' });
  return {
    recipientId: n.recipientId,
    type: `av_${n.event}`,
    title: translate(lang, 'gym', 'title'),
    body,
    url: n.event === 'ready' ? `/atletas/gym/${n.partnerId}/` : '/atletas/',
    push: n.push,
    leadId: n.leadId,
  };
}

/**
 * Deliver. `supabase` writes the in-app row (any authenticated user may insert
 * a notification for another; the service role works too). `origin` is the
 * request's own origin, so a local server pushes to itself and never to
 * NEXT_PUBLIC_SITE_URL, which on this branch names another project's port.
 * Returns how many pushes were dispatched, for the route's log line.
 */
export async function deliverNotifications(
  supabase: SupabaseClient,
  claimed: readonly ClaimedNotification[],
  options: { actorId: string | null; origin: string }
): Promise<number> {
  let pushed = 0;
  for (const n of claimed) {
    const r = renderNotification(n);
    const inApp = await createNotification(supabase, {
      recipient_id: r.recipientId,
      actor_id: options.actorId,
      type: r.type,
      entity_type: r.leadId ? 'pass_lead' : 'program',
      entity_id: r.leadId,
      message: r.body,
      action_url: r.url,
    });
    if (!inApp.success) logError(inApp.error, { action: 'av_notify_in_app', type: r.type });
    if (!r.push) continue;

    const secret = process.env.CRON_SECRET;
    if (!secret) {
      log('warn', 'av notify: CRON_SECRET unset, push not dispatched', { action: 'av_notify_push', type: r.type });
      continue;
    }
    try {
      const res = await fetch(`${options.origin}/api/notifications/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          userId: r.recipientId,
          title: r.title,
          body: r.body,
          url: r.url,
          type: r.type,
          data: { type: r.type },
        }),
      });
      if (res.ok) pushed += 1;
      else if (res.status !== 404)
        logError(new Error(`av push ${res.status}`), { action: 'av_notify_push', type: r.type });
    } catch (error) {
      logError(error, { action: 'av_notify_push', type: r.type });
    }
  }
  return pushed;
}
