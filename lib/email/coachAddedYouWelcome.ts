/**
 * Bilingual "your coach added you" welcome email.
 *
 * Sent when a Tribe.OS coach manually creates a client whose email
 * matches an existing Tribe user. Bridges the discoverability gap
 * between the coach's add-client action and the member's /my-coach
 * surface — without this, members would never know there's a place
 * to see their own training data.
 *
 * NOT sent during bulk CSV import. A coach migrating their roster
 * from a spreadsheet shouldn't spam 200 people with welcome emails;
 * those imports are quiet by design.
 *
 * Companion to the existing intelligence digest + beta welcome
 * emails — same brand styling, same FROM identity.
 *
 * Spanish copy is pending Verónica's review.
 */

import { Resend } from 'resend';
import { APP_STORE_URL, GOOGLE_PLAY_URL, INSTAGRAM_HANDLE } from './tribeOsWaitlist';

const FROM = 'Tribe <tribe@aplusfitnessllc.com>';

export interface CoachAddedYouParams {
  /** Member's display name as the coach typed it. */
  memberName: string;
  /** Member's email — recipient. Same email we matched against public.users. */
  memberEmail: string;
  /** Member's preferred_language, defaulting to en when missing. */
  language: 'en' | 'es';
  /** Display name of the gym the coach added them to. */
  gymName: string;
  /** Display name of the coach themselves, used in the body for warmth. */
  coachName: string;
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
    subject: (gymName: string) => `${gymName} added you to their roster`,
    eyebrow: 'Tribe.OS',
    headline: (gymName: string) => `You're on ${gymName}'s roster.`,
    intro: (coachName: string, gymName: string) =>
      `${coachName} added you to ${gymName} on Tribe.OS. Your training data — attendance, streaks, sessions, and the people you train with — is now visible to you in one place.`,
    whatYouSeeHeader: 'What you can see',
    whatYouSeeItems: [
      'Your total sessions and last-30-day count.',
      'Your current and longest streak — refreshed every time you check in.',
      'The training partners you show up alongside the most.',
      'Your recent attendance history.',
    ],
    privacyNote:
      'Coach-side notes and AI signals are intentionally NOT shared. Those are internal tools your coach uses to do a better job; your view is yours.',
    ctaLabel: 'Open my training',
    closing:
      'Open the link below any time. We refresh the data the moment your coach records new attendance — no waiting.',
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
  es: {
    subject: (gymName: string) => `${gymName} te agregó a su lista`,
    eyebrow: 'Tribe.OS',
    headline: (gymName: string) => `Estás en la lista de ${gymName}.`,
    intro: (coachName: string, gymName: string) =>
      `${coachName} te agregó a ${gymName} en Tribe.OS. Tus datos de entrenamiento — asistencia, rachas, sesiones y la gente con la que entrenas — ya están visibles en un solo lugar.`,
    whatYouSeeHeader: 'Lo que puedes ver',
    whatYouSeeItems: [
      'Tu total de sesiones y el conteo de los últimos 30 días.',
      'Tu racha actual y la más larga — se actualizan cada vez que asistes.',
      'Los compañeros con los que más coincides.',
      'Tu historial reciente de asistencias.',
    ],
    privacyNote:
      'Las notas internas del coach y las señales de IA NO se comparten. Esas son herramientas internas para que tu coach haga mejor su trabajo; tu vista es tuya.',
    ctaLabel: 'Abrir mi entrenamiento',
    closing:
      'Abre el enlace cuando quieras. Actualizamos los datos en el momento en que tu coach registra una nueva asistencia — sin esperas.',
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
} as const;

function renderHtml(params: CoachAddedYouParams, siteUrl: string): string {
  const c = copy[params.language];
  const gymName = escapeHtml(params.gymName);
  const coachName = escapeHtml(params.coachName);
  const ctaUrl = `${siteUrl}/my-coach`;

  const itemsHtml = c.whatYouSeeItems
    .map(
      (item) =>
        `<li style="margin: 0 0 8px; font-size: 14px; line-height: 1.55; color: #1f2937;">${escapeHtml(item)}</li>`
    )
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <div style="background: #272D34; padding: 28px 28px 22px;">
          <div style="font-size: 26px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.02em; margin: 0 0 22px;">Tribe<span style="color: #9EE551;">.</span></div>
          <p style="margin: 0; color: #9EE551; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;">${escapeHtml(c.eyebrow)}</p>
          <h1 style="margin: 8px 0 0; color: white; font-size: 22px; font-weight: 800; line-height: 1.25;">${escapeHtml(c.headline(gymName))}</h1>
        </div>
        <div style="padding: 26px 28px 12px;">
          <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #1f2937;">${escapeHtml(c.intro(coachName, gymName))}</p>

          <h2 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(c.whatYouSeeHeader)}</h2>
          <ul style="margin: 0 0 18px; padding: 0 0 0 20px;">${itemsHtml}</ul>

          <p style="margin: 0 0 22px; font-size: 13px; line-height: 1.55; color: #6b7280; font-style: italic;">${escapeHtml(c.privacyNote)}</p>

          <div style="text-align: center; margin: 18px 0 6px;">
            <a href="${ctaUrl}" style="display: inline-block; font-size: 14px; font-weight: 700; color: #272D34; background: #9EE551; padding: 12px 22px; border-radius: 999px; text-decoration: none;">${escapeHtml(c.ctaLabel)} →</a>
          </div>

          <p style="margin: 18px 0 0; font-size: 13px; line-height: 1.55; color: #6b7280;">${escapeHtml(c.closing)}</p>
          <p style="margin: 22px 0 0; font-size: 14px; color: #6b7280; white-space: pre-line;">${escapeHtml(c.sign)}</p>
        </div>
        <div style="background: #f3f4f6; padding: 18px 28px; border-top: 1px solid #e5e7eb; font-size: 13px;">
          <a href="${APP_STORE_URL}" style="color: #4b5563; text-decoration: none; margin-right: 16px;">${escapeHtml(c.appStoreLabel)}</a>
          <a href="${GOOGLE_PLAY_URL}" style="color: #4b5563; text-decoration: none; margin-right: 16px;">${escapeHtml(c.googlePlayLabel)}</a>
          <span style="color: #6b7280;">${escapeHtml(c.instagramLabel)} ${INSTAGRAM_HANDLE}</span>
        </div>
      </div>
    </div>
  `.trim();
}

function renderText(params: CoachAddedYouParams, siteUrl: string): string {
  const c = copy[params.language];
  const ctaUrl = `${siteUrl}/my-coach`;
  const items = c.whatYouSeeItems.map((line) => `  - ${line}`).join('\n');

  return [
    c.headline(params.gymName),
    '',
    c.intro(params.coachName, params.gymName),
    '',
    `${c.whatYouSeeHeader}:`,
    items,
    '',
    c.privacyNote,
    '',
    `${c.ctaLabel}: ${ctaUrl}`,
    '',
    c.closing,
    '',
    c.sign,
    '',
    `App Store: ${APP_STORE_URL}`,
    `Google Play: ${GOOGLE_PLAY_URL}`,
    `Instagram: ${INSTAGRAM_HANDLE}`,
  ].join('\n');
}

/**
 * Send the welcome. Caller is responsible for the "is this email a
 * Tribe user?" check before calling — this function just renders +
 * dispatches. Throws on Resend error so the caller can decide
 * whether to log-and-continue or surface to the user.
 */
export async function sendCoachAddedYouWelcome(params: CoachAddedYouParams, siteUrl: string): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: FROM,
    to: params.memberEmail,
    subject: copy[params.language].subject(params.gymName),
    html: renderHtml(params, siteUrl),
    text: renderText(params, siteUrl),
  });
}
