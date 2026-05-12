/**
 * Bilingual welcome email for the Tribe.OS premium beta.
 *
 * Sent from the grant CLI with the `--welcome` flag, or callable
 * directly from any admin tool that grants premium to a beta
 * participant.
 *
 * Companion to lib/email/tribeOsWaitlist.ts — same styling, same
 * sender identity, same bilingual structure. Reuses the App Store /
 * Google Play / Instagram links exported there to keep one source
 * of truth for those URLs.
 *
 * Spanish copy is pending Verónica's review. Drafts written by
 * Claude pre-vacation; replace and remove the marker on her return.
 */

import { Resend } from 'resend';
import { APP_STORE_URL, GOOGLE_PLAY_URL, INSTAGRAM_HANDLE } from './tribeOsWaitlist';

const FROM = 'Tribe <tribe@aplusfitnessllc.com>';

interface BetaWelcomeParams {
  name: string;
  email: string;
  /** Free premium runway in days. Default 90 per Week 4 spec. */
  freeDays: number;
  language: 'en' | 'es';
}

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    subject: 'Welcome to the Tribe.OS beta',
    eyebrow: 'Tribe.OS · Beta',
    headline: (name: string) => `${name}, you're in.`,
    intro: (freeDays: number) =>
      `You have full Tribe.OS premium access free for the next ${freeDays} days. ` +
      `That covers all the tools we built for instructors running paid sessions: ` +
      `client management, attendance tracking, payments through Stripe, and a ` +
      `revenue dashboard for tax season.`,
    canDoHeader: 'What you can do today',
    canDoItems: [
      {
        title: 'Manage your clients',
        body: 'Add your existing roster, log attendance per session, attach private notes only you can see.',
        link: '/os/clients',
        linkLabel: 'Open client list',
      },
      {
        title: 'Take payments through Stripe',
        body: 'Create paid sessions and let participants pay in the app. Stripe routes the money to your connected account.',
        link: '/create',
        linkLabel: 'Create a paid session',
      },
      {
        title: 'See your revenue',
        body: 'Gross, fees, refunds, and net by week or month. Export to CSV when tax season hits.',
        link: '/os/revenue',
        linkLabel: 'Open revenue dashboard',
      },
    ],
    expectationsHeader: 'What we are asking from you',
    expectations: [
      'Use Tribe.OS weekly with at least one real paid session per week.',
      'Tell us when something breaks. WhatsApp or email works. The faster we hear about a bug, the faster we fix it.',
      'Sit for a thirty-minute feedback call at the end of the month so we can hear what worked, what did not, and what is missing.',
    ],
    pricingHeader: 'After the beta',
    pricingBody: (freeDays: number) =>
      `After ${freeDays} days you choose: continue at thirty dollars per month, or stay on the fifteen percent revenue share. ` +
      `Whichever fits your business better. We will check in two weeks before that decision so it is not a surprise.`,
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
  es: {
    subject: 'Bienvenido a la beta de Tribe.OS',
    eyebrow: 'Tribe.OS · Beta',
    headline: (name: string) => `${name}, estás dentro.`,
    intro: (freeDays: number) =>
      `Tienes acceso completo a Tribe.OS premium gratis durante los próximos ${freeDays} días. ` +
      `Esto cubre todas las herramientas que construimos para instructores que cobran por sus sesiones: ` +
      `gestión de clientes, registro de asistencia, pagos a través de Stripe, y un panel de ingresos ` +
      `para la temporada de impuestos.`,
    canDoHeader: 'Lo que puedes hacer hoy',
    canDoItems: [
      {
        title: 'Gestiona tus clientes',
        body: 'Agrega tu lista actual, registra asistencia por sesión, añade notas privadas que solo tú ves.',
        link: '/os/clients',
        linkLabel: 'Abrir lista de clientes',
      },
      {
        title: 'Recibe pagos a través de Stripe',
        body: 'Crea sesiones pagadas y deja que los participantes paguen dentro de la app. Stripe envía el dinero a tu cuenta conectada.',
        link: '/create',
        linkLabel: 'Crear sesión pagada',
      },
      {
        title: 'Ve tus ingresos',
        body: 'Bruto, comisiones, reembolsos y neto por semana o mes. Exporta a CSV cuando llegue la temporada de impuestos.',
        link: '/os/revenue',
        linkLabel: 'Abrir panel de ingresos',
      },
    ],
    expectationsHeader: 'Lo que te pedimos a cambio',
    expectations: [
      'Usa Tribe.OS semanalmente con al menos una sesión pagada real por semana.',
      'Avísanos cuando algo falle. WhatsApp o correo funciona. Cuanto más rápido sepamos de un error, más rápido lo arreglamos.',
      'Una llamada de treinta minutos al final del mes para escuchar qué funcionó, qué no, y qué falta.',
    ],
    pricingHeader: 'Después de la beta',
    pricingBody: (freeDays: number) =>
      `Después de ${freeDays} días tú eliges: continuar a treinta dólares al mes, o quedarte con el quince por ciento de participación en ingresos. ` +
      `Lo que mejor se ajuste a tu negocio. Te contactaremos dos semanas antes de esa decisión para que no sea una sorpresa.`,
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
} as const;

function renderBetaWelcomeHtml(params: BetaWelcomeParams, siteUrl: string): string {
  const c = copy[params.language];
  const name = escapeHtml(params.name);

  const canDoItemsHtml = c.canDoItems
    .map(
      (item) => `
        <div style="margin: 0 0 18px; padding: 16px 18px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff;">
          <h3 style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #111827;">${escapeHtml(item.title)}</h3>
          <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.55; color: #374151;">${escapeHtml(item.body)}</p>
          <a href="${siteUrl}${item.link}" style="display: inline-block; font-size: 13px; font-weight: 700; color: #272D34; background: #9EE551; padding: 8px 14px; border-radius: 999px; text-decoration: none;">${escapeHtml(item.linkLabel)} →</a>
        </div>
      `
    )
    .join('');

  const expectationsHtml = c.expectations
    .map(
      (e) => `<li style="margin: 0 0 8px; font-size: 15px; line-height: 1.55; color: #1f2937;">${escapeHtml(e)}</li>`
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <div style="background: #272D34; padding: 28px 28px 22px;">
          <div style="font-size: 26px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.02em; margin: 0 0 22px;">Tribe<span style="color: #9EE551;">.</span></div>
          <p style="margin: 0; color: #9EE551; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;">${c.eyebrow}</p>
          <h1 style="margin: 8px 0 0; color: white; font-size: 24px; font-weight: 800; line-height: 1.25;">${c.headline(name)}</h1>
        </div>
        <div style="padding: 26px 28px 8px;">
          <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.6; color: #1f2937;">${escapeHtml(c.intro(params.freeDays))}</p>

          <h2 style="margin: 0 0 14px; font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${c.canDoHeader}</h2>
          ${canDoItemsHtml}

          <h2 style="margin: 26px 0 12px; font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${c.expectationsHeader}</h2>
          <ul style="margin: 0 0 22px; padding: 0 0 0 20px;">${expectationsHtml}</ul>

          <h2 style="margin: 26px 0 8px; font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${c.pricingHeader}</h2>
          <p style="margin: 0 0 22px; font-size: 15px; line-height: 1.6; color: #1f2937;">${escapeHtml(c.pricingBody(params.freeDays))}</p>

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

function renderBetaWelcomeText(params: BetaWelcomeParams, siteUrl: string): string {
  const c = copy[params.language];
  const canDoLines = c.canDoItems
    .map((item) => `- ${item.title}\n  ${item.body}\n  ${siteUrl}${item.link}`)
    .join('\n\n');
  const expectationsLines = c.expectations.map((e) => `- ${e}`).join('\n');

  return [
    c.headline(params.name),
    '',
    c.intro(params.freeDays),
    '',
    `${c.canDoHeader}:`,
    '',
    canDoLines,
    '',
    `${c.expectationsHeader}:`,
    expectationsLines,
    '',
    `${c.pricingHeader}:`,
    c.pricingBody(params.freeDays),
    '',
    c.sign,
    '',
    `App Store: ${APP_STORE_URL}`,
    `Google Play: ${GOOGLE_PLAY_URL}`,
    `Instagram: ${INSTAGRAM_HANDLE}`,
  ].join('\n');
}

/**
 * Send the Tribe.OS beta welcome email. Throws on Resend error so the
 * caller can decide whether to fail the grant or log-and-continue.
 * `siteUrl` is the base for the in-app deep links (e.g.
 * https://tribe-v3.vercel.app or the custom domain when it lands).
 */
export async function sendTribeOsBetaWelcome(params: BetaWelcomeParams, siteUrl: string): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: FROM,
    to: params.email,
    subject: copy[params.language].subject,
    html: renderBetaWelcomeHtml(params, siteUrl),
    text: renderBetaWelcomeText(params, siteUrl),
  });
}
