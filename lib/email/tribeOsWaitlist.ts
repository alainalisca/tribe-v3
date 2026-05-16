/**
 * Bilingual Resend emails for the Tribe.OS waitlist.
 *
 * Two emails fire after a successful signup:
 *   1. Confirmation to the user (in their selected locale).
 *   2. Notification to the admin inbox.
 *
 * Both are wrapped by the caller in try/catch so a Resend outage cannot
 * fail a waitlist signup. The DB row landing is the source of truth; the
 * emails are best-effort.
 *
 * Spanish copy is reviewed by Verónica. See
 * /Users/alainalisca/Desktop/Tribe - Diceus Code/TRIBE_OS_WEEK_1_STARTER_PACK/copy/
 * for the canonical text.
 */

import { Resend } from 'resend';

const ADMIN_EMAIL = 'tribe@aplusfitnessllc.com';
const FROM = 'Tribe <tribe@aplusfitnessllc.com>';

export const APP_STORE_URL = 'https://apps.apple.com/us/app/tribe-never-train-alone/id6458219258';
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=prod.tribe.android';
export const INSTAGRAM_HANDLE = '@tribe.nevertrainalone';

export type PricingPreference = 'monthly_30' | 'revenue_share_15';

interface ConfirmationParams {
  name: string;
  email: string;
  whatTheyTeach: string;
  sessionsPerWeek: number | null;
  pricingPreference: PricingPreference;
  language: 'en' | 'es';
}

interface AdminNotificationParams extends ConfirmationParams {
  comments: string | null;
  createdAt: string;
}

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

function pricingLabel(pref: PricingPreference, language: 'en' | 'es'): string {
  if (language === 'es') {
    return pref === 'monthly_30' ? 'treinta dólares al mes' : 'quince por ciento de participación en ingresos';
  }
  return pref === 'monthly_30' ? 'thirty dollars per month' : 'fifteen percent revenue share';
}

function formatSessions(n: number | null, language: 'en' | 'es'): string {
  if (n === null) return language === 'es' ? 'algunas' : 'a few';
  return String(n);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ES PENDING VERONICA REVIEW — drafts below come from the starter pack.
// Once Verónica returns edits, replace the strings in `confirmationCopy.es`
// and remove this comment.
const confirmationCopy = {
  en: {
    subject: 'Welcome to the Tribe.OS waitlist',
    greeting: (name: string) => `Hi ${name},`,
    body: (teaches: string, sessions: string, pricingText: string) =>
      `Thanks for joining the Tribe.OS waitlist.\n\nYou signed up because you teach ${teaches} and run about ${sessions} sessions per week. Your pricing preference is ${pricingText}.\n\nWe are building Tribe.OS based on what instructors and group leaders are actually asking for. We will reach out as soon as we open early access. If you have ideas for what would help your business most, just reply to this email.\n\nIn the meantime, keep using the free Tribe app. Every session you post reaches participants you have not met yet.`,
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
  es: {
    subject: 'Bienvenido a la lista de espera de Tribe.OS',
    greeting: (name: string) => `Hola ${name},`,
    body: (teaches: string, sessions: string, pricingText: string) =>
      `Gracias por unirte a la lista de espera de Tribe.OS.\n\nTe inscribiste porque enseñas ${teaches} y realizas alrededor de ${sessions} sesiones por semana. Tu preferencia de precios es ${pricingText}.\n\nEstamos construyendo Tribe.OS con base en lo que los instructores y líderes de grupo realmente están pidiendo. Te contactaremos en cuanto abramos el acceso anticipado. Si tienes ideas sobre qué ayudaría más a tu negocio, simplemente responde a este correo.\n\nMientras tanto, sigue usando la aplicación Tribe gratuita. Cada sesión que publicas llega a participantes que aún no conoces.`,
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
} as const;

function renderConfirmationHtml(params: ConfirmationParams): string {
  const c = confirmationCopy[params.language];
  const teaches = escapeHtml(params.whatTheyTeach);
  const name = escapeHtml(params.name);
  const sessions = escapeHtml(formatSessions(params.sessionsPerWeek, params.language));
  const pricingText = escapeHtml(pricingLabel(params.pricingPreference, params.language));

  const bodyParas = c
    .body(teaches, sessions, pricingText)
    .split('\n\n')
    .map(
      (p) =>
        `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #1f2937;">${p.replace(/\n/g, '<br>')}</p>`
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <div style="background: #272D34; padding: 28px 28px 22px;">
          <div style="font-size: 26px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.02em; margin: 0 0 22px;">Tribe<span style="color: #9EE551;">.</span></div>
          <p style="margin: 0; color: #9EE551; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;">Tribe.OS</p>
          <h1 style="margin: 8px 0 0; color: white; font-size: 22px; font-weight: 800; line-height: 1.25;">${c.subject}</h1>
        </div>
        <div style="padding: 26px 28px 22px;">
          <p style="margin: 0 0 18px; font-size: 16px; color: #111827; font-weight: 600;">${c.greeting(name)}</p>
          ${bodyParas}
          <p style="margin: 22px 0 0; font-size: 14px; color: #6b7280; white-space: pre-line;">${escapeHtml(c.sign)}</p>
        </div>
        <div style="background: #f3f4f6; padding: 18px 28px; border-top: 1px solid #e5e7eb; font-size: 13px;">
          <a href="${APP_STORE_URL}" style="color: #4b5563; text-decoration: none; margin-right: 16px;">${c.appStoreLabel}</a>
          <a href="${GOOGLE_PLAY_URL}" style="color: #4b5563; text-decoration: none; margin-right: 16px;">${c.googlePlayLabel}</a>
          <span style="color: #6b7280;">${c.instagramLabel} ${INSTAGRAM_HANDLE}</span>
        </div>
      </div>
    </div>
  `.trim();
}

function renderConfirmationText(params: ConfirmationParams): string {
  const c = confirmationCopy[params.language];
  const sessions = formatSessions(params.sessionsPerWeek, params.language);
  const pricingText = pricingLabel(params.pricingPreference, params.language);

  return [
    c.greeting(params.name),
    '',
    c.body(params.whatTheyTeach, sessions, pricingText),
    '',
    c.sign,
    '',
    `App Store: ${APP_STORE_URL}`,
    `Google Play: ${GOOGLE_PLAY_URL}`,
    `Instagram: ${INSTAGRAM_HANDLE}`,
  ].join('\n');
}

/** Send the user-facing confirmation email. Throws on Resend error. */
export async function sendTribeOsWaitlistConfirmation(params: ConfirmationParams): Promise<void> {
  const resend = getResendClient();
  const subject = confirmationCopy[params.language].subject;
  await resend.emails.send({
    from: FROM,
    to: params.email,
    subject,
    html: renderConfirmationHtml(params),
    text: renderConfirmationText(params),
  });
}

/** Send the admin notification to tribe@aplusfitnessllc.com. Throws on Resend error. */
export async function sendTribeOsWaitlistAdminNotification(params: AdminNotificationParams): Promise<void> {
  const resend = getResendClient();
  const sessions = params.sessionsPerWeek === null ? '(not specified)' : String(params.sessionsPerWeek);
  const pricingText = pricingLabel(params.pricingPreference, 'en');
  const comments = params.comments && params.comments.trim().length > 0 ? params.comments : '(none)';

  const text = [
    'A new Tribe.OS waitlist entry just landed.',
    '',
    `Name: ${params.name}`,
    `Email: ${params.email}`,
    `Teaches: ${params.whatTheyTeach}`,
    `Sessions per week: ${sessions}`,
    `Pricing preference: ${pricingText}`,
    `Locale: ${params.language}`,
    `Comments: ${comments}`,
    '',
    `Created at: ${params.createdAt}`,
    '',
    'Open the Supabase tribe_os_waitlist table for the full record.',
  ].join('\n');

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: 'New Tribe.OS waitlist signup',
    text,
  });
}
