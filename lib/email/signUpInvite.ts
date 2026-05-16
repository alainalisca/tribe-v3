/**
 * Bilingual "your coach added you — claim your training" invite email.
 *
 * Sent when a Tribe.OS coach manually creates a client whose email
 * does NOT match an existing Tribe user. Sister surface to
 * coachAddedYouWelcome (which fires for emails that DO match). The
 * value calculation is different:
 *
 *   - Welcome email = "your data exists, here's where to see it"
 *     (a warm signpost to /my-coach)
 *   - Invite email  = "sign up with this exact email and your data
 *     will appear automatically" (an acquisition funnel)
 *
 * Why this isn't cold outreach: the gym coach explicitly added this
 * person to their roster with this email address. The email
 * recipient gave that email to a real-world business they're already
 * doing business with. We make that explicit in the body so the
 * recipient understands why they're getting it.
 *
 * NOT sent during bulk CSV import. That stays quiet — a coach
 * migrating 200 contacts shouldn't unleash 200 cold-ish emails.
 *
 * Spanish copy is pending Verónica's review.
 */

import { Resend } from 'resend';
import { APP_STORE_URL, GOOGLE_PLAY_URL, INSTAGRAM_HANDLE } from './tribeOsWaitlist';

const FROM = 'Tribe <tribe@aplusfitnessllc.com>';

export interface SignUpInviteParams {
  /** Member's display name as the coach typed it. */
  memberName: string;
  /** Member's email — recipient + the exact email they should use to sign up. */
  memberEmail: string;
  /**
   * Recipient's preferred language. Since they're NOT yet a Tribe
   * user, we don't have a stored preference. The caller should fall
   * back to the gym owner's preferred_language so the invite arrives
   * in the language the coach's other communications use.
   */
  language: 'en' | 'es';
  /** Display name of the gym the coach added them to. */
  gymName: string;
  /** Display name of the coach themselves. */
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
    subject: (gymName: string) => `${gymName} added you — claim your training on Tribe`,
    eyebrow: 'Tribe.OS',
    headline: (coachName: string) => `${coachName} added you to their gym.`,
    intro: (coachName: string, gymName: string) =>
      `${coachName} just added you to ${gymName} on Tribe.OS. They're tracking your attendance, sessions, and progress so you can see it all in one place — but the data only shows up when you have a Tribe account tied to the same email address.`,
    instructionsHeader: 'How to claim your training',
    instructionsItems: (email: string) => [
      `Tap the button below to create a free Tribe account.`,
      `Use this exact email so your data matches: ${email}`,
      `Once you're signed in, your training record loads automatically.`,
    ],
    whatYouGetHeader: 'What you can see, free',
    whatYouGetItems: [
      'Your total sessions and last-30-day count.',
      'Your current and longest streak.',
      'Training partners you show up alongside the most.',
      'Recent attendance, refreshed in real time.',
    ],
    privacyNote:
      "We never share coach-side notes or AI signals — those stay internal. Your view is yours. We won't email you again unless you sign up.",
    ctaLabel: 'Create my Tribe account',
    closing: (gymName: string) =>
      `If you didn't expect this, you can safely ignore the email — it just means someone at ${gymName} typed your email by mistake.`,
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
  es: {
    subject: (gymName: string) => `${gymName} te agregó — reclama tu entrenamiento en Tribe`,
    eyebrow: 'Tribe.OS',
    headline: (coachName: string) => `${coachName} te agregó a su gym.`,
    intro: (coachName: string, gymName: string) =>
      `${coachName} acaba de agregarte a ${gymName} en Tribe.OS. Están registrando tu asistencia, sesiones y progreso para que puedas verlo todo en un solo lugar — pero los datos solo aparecen cuando tienes una cuenta de Tribe ligada al mismo correo.`,
    instructionsHeader: 'Cómo reclamar tu entrenamiento',
    instructionsItems: (email: string) => [
      `Toca el botón de abajo para crear una cuenta gratis en Tribe.`,
      `Usa exactamente este correo para que coincidan los datos: ${email}`,
      `Cuando inicies sesión, tu registro de entrenamiento aparecerá automáticamente.`,
    ],
    whatYouGetHeader: 'Lo que verás, gratis',
    whatYouGetItems: [
      'Tu total de sesiones y el conteo de los últimos 30 días.',
      'Tu racha actual y la mejor que has tenido.',
      'Los compañeros con los que más coincides.',
      'Tu asistencia reciente, en tiempo real.',
    ],
    privacyNote:
      'Nunca compartimos notas internas del coach ni señales de IA — esas se quedan adentro. Tu vista es tuya. No te volveremos a escribir a menos que te registres.',
    ctaLabel: 'Crear mi cuenta de Tribe',
    closing: (gymName: string) =>
      `Si no esperabas este correo, puedes ignorarlo sin problema — significa que alguien en ${gymName} escribió mal tu correo.`,
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
} as const;

function renderHtml(params: SignUpInviteParams, siteUrl: string): string {
  const c = copy[params.language];
  const gymName = escapeHtml(params.gymName);
  const coachName = escapeHtml(params.coachName);
  const memberEmail = escapeHtml(params.memberEmail);
  // CTA lands on /auth. Since /my-coach itself redirects unauthenticated
  // users to /auth?returnTo=/my-coach today, a direct link to /my-coach
  // would also work — but routing them to /auth signals "this is a
  // sign-up flow" up front, which matches the email's framing.
  const ctaUrl = `${siteUrl}/auth`;

  const instructionsHtml = c
    .instructionsItems(params.memberEmail)
    .map(
      (item) =>
        `<li style="margin: 0 0 8px; font-size: 14px; line-height: 1.55; color: #1f2937;">${escapeHtml(item)}</li>`
    )
    .join('');

  const whatYouGetHtml = c.whatYouGetItems
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
          <h1 style="margin: 8px 0 0; color: white; font-size: 22px; font-weight: 800; line-height: 1.25;">${escapeHtml(c.headline(coachName))}</h1>
        </div>
        <div style="padding: 26px 28px 12px;">
          <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #1f2937;">${escapeHtml(c.intro(coachName, gymName))}</p>

          <h2 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(c.instructionsHeader)}</h2>
          <ol style="margin: 0 0 22px; padding: 0 0 0 20px;">${instructionsHtml}</ol>

          <div style="text-align: center; margin: 18px 0 22px;">
            <a href="${ctaUrl}" style="display: inline-block; font-size: 14px; font-weight: 700; color: #272D34; background: #9EE551; padding: 12px 22px; border-radius: 999px; text-decoration: none;">${escapeHtml(c.ctaLabel)} →</a>
            <p style="margin: 10px 0 0; font-size: 12px; color: #6b7280;">${memberEmail}</p>
          </div>

          <h2 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(c.whatYouGetHeader)}</h2>
          <ul style="margin: 0 0 18px; padding: 0 0 0 20px;">${whatYouGetHtml}</ul>

          <p style="margin: 0 0 22px; font-size: 13px; line-height: 1.55; color: #6b7280; font-style: italic;">${escapeHtml(c.privacyNote)}</p>

          <p style="margin: 18px 0 0; font-size: 13px; line-height: 1.55; color: #6b7280;">${escapeHtml(c.closing(gymName))}</p>
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

function renderText(params: SignUpInviteParams, siteUrl: string): string {
  const c = copy[params.language];
  const ctaUrl = `${siteUrl}/auth`;
  const instructions = c
    .instructionsItems(params.memberEmail)
    .map((line, i) => `  ${i + 1}. ${line}`)
    .join('\n');
  const features = c.whatYouGetItems.map((line) => `  - ${line}`).join('\n');

  return [
    c.headline(params.coachName),
    '',
    c.intro(params.coachName, params.gymName),
    '',
    `${c.instructionsHeader}:`,
    instructions,
    '',
    `${c.ctaLabel}: ${ctaUrl}`,
    `(${params.memberEmail})`,
    '',
    `${c.whatYouGetHeader}:`,
    features,
    '',
    c.privacyNote,
    '',
    c.closing(params.gymName),
    '',
    c.sign,
    '',
    `App Store: ${APP_STORE_URL}`,
    `Google Play: ${GOOGLE_PLAY_URL}`,
    `Instagram: ${INSTAGRAM_HANDLE}`,
  ].join('\n');
}

/**
 * Send the sign-up invite. Caller is responsible for the "is this
 * email a Tribe user?" check — this function fires unconditionally
 * and assumes the recipient is NOT yet on Tribe. Throws on Resend
 * error so the caller can decide whether to log-and-continue.
 */
export async function sendSignUpInvite(params: SignUpInviteParams, siteUrl: string): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: FROM,
    to: params.memberEmail,
    subject: copy[params.language].subject(params.gymName),
    html: renderHtml(params, siteUrl),
    text: renderText(params, siteUrl),
  });
}
