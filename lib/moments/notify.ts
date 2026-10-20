import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/dal/notifications';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';
import { isEmailSuppressed } from '@/lib/dal/emailUnsubscribe';
import { getResendClient } from '@/lib/email/resendClient';
import { TRIBE_FROM } from '@/lib/email/sender';
import { SITE_URL } from '@/lib/http/siteUrl';
import { publicSessionTitle } from '@/lib/share/sessionPublic';
import { translateSport } from '@/lib/sportTranslationData';
import { firstName } from '@/lib/text/firstName';
import { log, logError } from '@/lib/logger';
import { MOMENTS_BUCKET, momentVariantPath } from './paths';
import { recipientLanguage, type LanguagePreference } from '@/lib/i18n/recipientLanguage';

/**
 * T-MOM1: what Moments tells people.
 *
 *   moments_delivered       the one notice per delivered batch, to each tagged
 *                           person: "Tienes 6 fotos nuevas de Boxeo con Salomón".
 *                           In-app, push, and when the person has no push token,
 *                           one email (one line and a 400 px thumbnail of the
 *                           first photo they are in).
 *   moments_thanks          "Gracias": to the uploader, once per batch.
 *   moments_delete_request  "Pedir que la borren": to the uploader.
 *
 * Push goes through /api/notifications/send with the type, so the person's
 * session-updates preference decides; the email checks the same preference on
 * the email channel and the unsubscribe record. In-app is never gated.
 */
type Lang = 'es' | 'en';

export function momentsMessage(count: number, title: string, lang: Lang): string {
  if (lang === 'en')
    return count === 1 ? `You have 1 new photo from ${title}` : `You have ${count} new photos from ${title}`;
  return count === 1 ? `Tienes 1 foto nueva de ${title}` : `Tienes ${count} fotos nuevas de ${title}`;
}

const WEEKDAY: Record<Lang, string[]> = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** "Boxeo del martes" / "Boxing on Tuesday": the session's own title, or its sport, and the weekday. */
export function sessionOfDay(s: { title: string | null; sport: string | null; date: string }, lang: Lang): string {
  const what =
    s.title?.trim() ||
    (s.sport && s.sport !== 'Other' ? translateSport(s.sport, lang) : lang === 'en' ? 'the session' : 'la sesión');
  const day = WEEKDAY[lang][new Date(`${s.date}T12:00:00`).getDay()];
  return lang === 'en' ? `${what} on ${day}` : `${what} del ${day}`;
}

/** "Juan te dio las gracias por las fotos de Boxeo del martes" */
export function thanksMessage(name: string, sessionDay: string, lang: Lang): string {
  return lang === 'en'
    ? `${name} thanked you for the photos from ${sessionDay}`
    : `${name} te dio las gracias por las fotos de ${sessionDay}`;
}

/** "Juan pidió que borres una foto de Boxeo del martes" */
export function deleteRequestMessage(name: string, sessionDay: string, lang: Lang): string {
  return lang === 'en'
    ? `${name} asked you to delete a photo from ${sessionDay}`
    : `${name} pidió que borres una foto de ${sessionDay}`;
}

/** Where a person's photos of one session open: their Momentos, with that batch open. */
export function momentosHref(sessionId: string): string {
  return `/profile/momentos/?s=${sessionId}`;
}

type Recipient = { lang: Lang; email: string | null };

async function recipient(service: SupabaseClient, userId: string): Promise<Recipient> {
  const { data } = await service
    .from('users')
    .select('preferred_language, preferred_language_set_at, email')
    .eq('id', userId)
    .maybeSingle();
  const u = data as (LanguagePreference & { email?: string | null }) | null;
  return { lang: recipientLanguage(u), email: u?.email ?? null };
}

/** In-app, then push. 'no_token' is the push route's 404: the person has no device to push to. */
async function inAppAndPush(
  service: SupabaseClient,
  n: {
    userId: string;
    actorId: string;
    type: string;
    sessionId: string;
    title: string;
    message: string;
    url: string;
  }
): Promise<'sent' | 'no_token' | 'skipped'> {
  const inApp = await createNotification(service, {
    recipient_id: n.userId,
    actor_id: n.actorId,
    type: n.type,
    entity_type: 'session',
    entity_id: n.sessionId,
    message: n.message,
    action_url: n.url,
  });
  if (!inApp.success) logError(inApp.error, { action: `moments.notify.inApp.${n.type}`, sessionId: n.sessionId });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const cronSecret = process.env.CRON_SECRET;
  if (!siteUrl || !cronSecret) return 'skipped';
  const res = await fetch(`${siteUrl}/api/notifications/send/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
    body: JSON.stringify({
      userId: n.userId,
      title: n.title,
      body: n.message,
      url: n.url,
      type: n.type,
      data: { sessionId: n.sessionId, type: n.type },
    }),
  }).catch((e) => {
    logError(e, { action: `moments.notify.push.${n.type}`, sessionId: n.sessionId });
    return null;
  });
  if (res?.status === 404) return 'no_token';
  return res?.ok ? 'sent' : 'skipped';
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The fallback email: the same line as the push, one 400 px photo, one link. */
export function momentsEmailHtml(message: string, thumbUrl: string | null, href: string, lang: Lang): string {
  const cta = lang === 'en' ? 'See my photos' : 'Ver mis fotos';
  const img = thumbUrl
    ? `<p style="margin:16px 0"><a href="${escapeHtml(href)}"><img src="${escapeHtml(thumbUrl)}" width="400" alt="" style="display:block;width:400px;max-width:100%;height:auto;border:0"></a></p>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#272D34;max-width:440px">
<p style="margin:0">${escapeHtml(message)}</p>${img}
<p style="margin:0"><a href="${escapeHtml(href)}" style="color:#272D34;font-weight:bold">${cta}</a></p>
</div>`;
}

/** An email thumbnail outlives the 1-hour screen URLs: a week, so the email still shows it tomorrow. */
const EMAIL_THUMB_TTL_SECONDS = 7 * 24 * 60 * 60;

async function emailFallback(
  service: SupabaseClient,
  r: Recipient,
  userId: string,
  message: string,
  url: string,
  firstPath: string | null
): Promise<void> {
  if (!r.email) return;
  if (!(await shouldSendNotification(service, userId, 'moments_delivered', 'email'))) return;
  if (await isEmailSuppressed(service, userId)) return;
  let thumb: string | null = null;
  if (firstPath) {
    const { data } = await service.storage
      .from(MOMENTS_BUCKET)
      .createSignedUrl(momentVariantPath(firstPath, 'grid'), EMAIL_THUMB_TTL_SECONDS);
    thumb = data?.signedUrl ?? null;
  }
  const { error } = await getResendClient('momentsDelivered').emails.send({
    from: TRIBE_FROM,
    to: r.email,
    subject: message,
    html: momentsEmailHtml(message, thumb, `${SITE_URL}${url}`, r.lang),
    text: `${message}\n\n${SITE_URL}${url}`,
  });
  if (error) logError(error, { action: 'moments.notify.email' });
}

export function makeMomentsNotifier(
  service: SupabaseClient,
  args: {
    sessionId: string;
    actorId: string;
    session: { title: string | null; sport: string | null; creatorName: string | null };
  }
) {
  return async (userId: string, count: number, firstPath: string | null = null): Promise<void> => {
    const r = await recipient(service, userId);
    const title = publicSessionTitle(args.session, r.lang);
    const message = momentsMessage(count, title, r.lang);
    const url = momentosHref(args.sessionId);
    const push = await inAppAndPush(service, {
      userId,
      actorId: args.actorId,
      type: 'moments_delivered',
      sessionId: args.sessionId,
      title: r.lang === 'en' ? 'New photos' : 'Fotos nuevas',
      message,
      url,
    });
    if (push === 'no_token') {
      log('info', 'moments: no push token, email fallback', { sessionId: args.sessionId });
      await emailFallback(service, r, userId, message, url, firstPath).catch((e) =>
        logError(e, { action: 'moments.notify.email', sessionId: args.sessionId })
      );
    }
  };
}

/** To an uploader: someone thanked them, or asked them to delete a photo. */
export async function notifyUploader(
  service: SupabaseClient,
  args: {
    kind: 'thanks' | 'delete_request';
    uploaderId: string;
    actorId: string;
    actorName: string | null;
    session: { id: string; title: string | null; sport: string | null; date: string };
  }
): Promise<void> {
  const r = await recipient(service, args.uploaderId);
  const name = firstName(args.actorName) || (r.lang === 'en' ? 'Someone' : 'Alguien');
  const day = sessionOfDay(args.session, r.lang);
  const thanks = args.kind === 'thanks';
  await inAppAndPush(service, {
    userId: args.uploaderId,
    actorId: args.actorId,
    type: thanks ? 'moments_thanks' : 'moments_delete_request',
    sessionId: args.session.id,
    title: thanks ? (r.lang === 'en' ? 'Thank you' : 'Gracias') : r.lang === 'en' ? 'Photo' : 'Foto',
    message: thanks ? thanksMessage(name, day, r.lang) : deleteRequestMessage(name, day, r.lang),
    // The uploader deletes on the session's photo screen.
    url: `/session/${args.session.id}/fotos/subir/`,
  });
}
