/** Welcome onboarding email — bilingual, sent once after a new user's first sign-in. */
import { Resend } from 'resend';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

interface SendWelcomeEmailParams {
  email: string;
  name: string | null;
  language: string;
}

interface WelcomeEmailCopy {
  subject: string;
  greeting: string;
  intro: string;
  framing: string;
  cta: string;
  closing: string;
  tagline: string;
  footer: string;
}

function getCopy(name: string | null, isSpanish: boolean): WelcomeEmailCopy {
  if (isSpanish) {
    return {
      subject: 'Te damos la bienvenida a Tribe',
      greeting: name ? `Hola ${name},` : 'Hola,',
      intro: 'Te damos la bienvenida a Tribe. Nos alegra tenerte aquí.',
      framing:
        'Tribe es un tablero en vivo de sesiones de deporte y fitness en grupo que pasan en tu ciudad, no otra app para registrar entrenamientos.',
      cta: 'Abre la app y encuentra una sesión cerca de ti — luego solo preséntate y entrena con tu tribu.',
      closing: 'Nos vemos en una sesión. 💪',
      tagline: 'Nunca Entrenes Solo',
      footer: 'Recibiste este email porque acabas de unirte a Tribe.',
    };
  }
  return {
    subject: 'Welcome to Tribe',
    greeting: name ? `Hey ${name},` : 'Hey there,',
    intro: "Welcome to Tribe — we're glad you're here.",
    framing:
      'Tribe is a live board of group sport and fitness sessions happening around your city, not another workout tracker.',
    cta: 'Open the app and find a session happening near you — then just show up and train with your tribe.',
    closing: 'See you at a session. 💪',
    tagline: 'Never Train Alone',
    footer: 'You received this email because you just joined Tribe.',
  };
}

/**
 * Send the one-time welcome onboarding email to a new user.
 * Bilingual: Spanish when `language` starts with 'es', English otherwise.
 * Never throws — failures are returned as `{ success: false, error }`.
 */
export async function sendWelcomeEmail(params: SendWelcomeEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const isSpanish = params.language.toLowerCase().startsWith('es');
    const copy = getCopy(params.name, isSpanish);

    const { error } = await resend.emails.send({
      from: 'Tribe <tribe@aplusfitnessllc.com>',
      to: params.email,
      subject: copy.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
              <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">${copy.tagline}</p>
            </div>

            <h2 style="color: #1e293b; margin-bottom: 15px;">${copy.greeting}</h2>

            <p style="color: #374151; line-height: 1.6; font-size: 16px;">${copy.intro}</p>

            <p style="color: #374151; line-height: 1.6; font-size: 16px;">${copy.framing}</p>

            <div style="background: #f3f4f6; border-left: 4px solid #9EE551; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
              <p style="color: #1e293b; line-height: 1.6; font-size: 16px; font-weight: 600; margin: 0;">${copy.cta}</p>
            </div>

            <p style="color: #374151; line-height: 1.6; margin-top: 20px;">${copy.closing}</p>

            <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">${copy.footer}</p>
            </div>
          </div>

          <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 20px;">
            © ${new Date().getFullYear()} Tribe · ${copy.tagline}
          </p>
        </div>
      `,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send welcome email';
    return { success: false, error: message };
  }
}
