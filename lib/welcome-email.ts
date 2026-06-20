import { Resend } from 'resend';
import { logError } from '@/lib/logger';

/** Lazily build the Resend client. Throws if the API key is not configured. */
function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

interface SendWelcomeEmailParams {
  email: string;
  name: string | null;
  language: string;
}

interface SendWelcomeEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Sends the one-time welcome onboarding email to a newly registered user.
 *
 * Bilingual (Spanish when `language` starts with 'es', English otherwise) and
 * gender-neutral. Frames Tribe as a live board of nearby group sessions and
 * drives a single CTA — open the app and find a session — with no links/URLs.
 *
 * Never throws: all failures are caught and returned as `{ success: false }`.
 */
export async function sendWelcomeEmail(params: SendWelcomeEmailParams): Promise<SendWelcomeEmailResult> {
  const { email, name, language } = params;
  try {
    const resend = getResendClient();
    const isSpanish = language.startsWith('es');

    const trimmedName = name?.trim() || '';
    const hasName = trimmedName.length > 0;

    const subject = isSpanish ? 'Te damos la bienvenida a Tribe' : 'Welcome to Tribe';
    const tagline = isSpanish ? 'Nunca Entrenes Solo' : 'Never Train Alone';

    const greeting = isSpanish
      ? hasName
        ? `Hola ${trimmedName},`
        : 'Hola,'
      : hasName
        ? `Hey ${trimmedName},`
        : 'Hey there,';

    const intro = isSpanish
      ? 'Te damos la bienvenida a Tribe. Nos alegra tenerte aquí.'
      : "Welcome to Tribe. We're glad to have you here.";

    const frame = isSpanish
      ? 'Tribe es un tablero en vivo de sesiones de deporte y fitness en grupo que pasan en tu ciudad, no otra app para registrar entrenamientos.'
      : 'Tribe is a live board of group sport and fitness sessions happening around your city, not another workout tracker.';

    const cta = isSpanish
      ? 'Abre la app y encuentra una sesión cerca de ti.'
      : 'Open the app and find a session near you.';

    const footerNote = isSpanish
      ? 'Recibiste este email porque te uniste a Tribe.'
      : 'You received this email because you joined Tribe.';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
        <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
            <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">${tagline}</p>
          </div>

          <h2 style="color: #1e293b; margin-bottom: 15px;">${greeting}</h2>

          <p style="color: #374151; line-height: 1.6; font-size: 16px;">${intro}</p>

          <p style="color: #374151; line-height: 1.6; font-size: 16px;">${frame}</p>

          <div style="background: #f4fbe9; border-left: 4px solid #9EE551; border-radius: 8px; padding: 16px 20px; margin: 28px 0;">
            <p style="color: #1e293b; font-weight: 600; font-size: 16px; margin: 0;">${cta}</p>
          </div>

          <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">${footerNote}</p>
          </div>
        </div>

        <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 20px;">
          © ${new Date().getFullYear()} Tribe · ${tagline}
        </p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: 'Tribe <tribe@aplusfitnessllc.com>',
      to: email,
      subject,
      html,
    });

    if (error) {
      logError(error, { action: 'sendWelcomeEmail', email });
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    logError(error, { action: 'sendWelcomeEmail', email });
    return { success: false, error: 'Failed to send welcome email' };
  }
}
