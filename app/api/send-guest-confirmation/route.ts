import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';

interface GuestConfirmationBody {
  email: string;
  guestName: string;
  sessionId: string;
  sessionSport: string;
  sessionDate: string;
  sessionTime: string;
  sessionLocation: string;
  hostName: string;
  language?: 'en' | 'es';
}

/**
 * @description Sends a confirmation email to a guest who joined a training session, with session details and a link to view the session page.
 * @method POST
 * @auth None required — called fire-and-forget from the client after a guest join. Rate abuse is mitigated by the guest join flow itself.
 * @param {GuestConfirmationBody} request.body - Guest and session details for the confirmation email.
 * @returns {{ success: boolean }} 200 on success, 400 if required fields are missing, 500 on failure.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: max 10 guest confirmations per minute per IP.
    // No auth on this endpoint (public guest flow), so we use service role
    // to write the rate_limits row.
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimitClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { allowed } = await checkRateLimit(rateLimitClient, `guest-confirm:${ip}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = (await request.json()) as GuestConfirmationBody;
    const { email, guestName, sessionId, sessionSport, sessionDate, sessionTime, sessionLocation, hostName, language } =
      body;

    if (!email || !guestName || !sessionId || !sessionSport || !sessionDate || !sessionTime || !sessionLocation) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const resend = getResendClient();
    const isSpanish = language === 'es';

    const subject = isSpanish ? `¡Estás confirmado para ${sessionSport}!` : `You're confirmed for ${sessionSport}!`;

    const greeting = isSpanish ? `¡Hola ${guestName}!` : `Hey ${guestName}!`;

    const confirmed = isSpanish
      ? `Tu asistencia está confirmada para la siguiente sesión de entrenamiento:`
      : `Your attendance is confirmed for the following training session:`;

    const sportLabel = isSpanish ? 'Deporte' : 'Sport';
    const dateLabel = isSpanish ? 'Fecha' : 'Date';
    const timeLabel = isSpanish ? 'Hora' : 'Time';
    const locationLabel = isSpanish ? 'Lugar' : 'Location';
    const hostedByLabel = isSpanish ? 'Organizado por' : 'Hosted by';
    const buttonText = isSpanish ? 'Ver Sesión' : 'View Session';
    const tagline = isSpanish ? 'Nunca Entrenes Solo' : 'Never Train Alone';
    const footer = isSpanish
      ? 'Si tienes preguntas, contacta al organizador a través de la página de la sesión.'
      : 'If you have questions, reach out to the host through the session page.';

    await resend.emails.send({
      from: 'Tribe <tribe@aplusfitnessllc.com>',
      to: email,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
              <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">${tagline}</p>
            </div>

            <h2 style="color: #1e293b; margin-bottom: 15px;">${greeting}</h2>

            <p style="color: #374151; line-height: 1.6;">${confirmed}</p>

            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #9EE551;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #6b7280; padding: 4px 12px 4px 0; font-size: 14px; white-space: nowrap;">${sportLabel}</td>
                  <td style="color: #1e293b; padding: 4px 0; font-weight: 600; font-size: 14px;">${sessionSport}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 4px 12px 4px 0; font-size: 14px; white-space: nowrap;">${dateLabel}</td>
                  <td style="color: #1e293b; padding: 4px 0; font-weight: 600; font-size: 14px;">${sessionDate}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 4px 12px 4px 0; font-size: 14px; white-space: nowrap;">${timeLabel}</td>
                  <td style="color: #1e293b; padding: 4px 0; font-weight: 600; font-size: 14px;">${sessionTime}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 4px 12px 4px 0; font-size: 14px; white-space: nowrap;">${locationLabel}</td>
                  <td style="color: #1e293b; padding: 4px 0; font-weight: 600; font-size: 14px;">${sessionLocation}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 4px 12px 4px 0; font-size: 14px; white-space: nowrap;">${hostedByLabel}</td>
                  <td style="color: #1e293b; padding: 4px 0; font-weight: 600; font-size: 14px;">${hostName}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/session/${sessionId}"
                 style="display: inline-block; background: #9EE551; color: #1e293b; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                ${buttonText}
              </a>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">${footer}</p>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <p style="color: #9ca3af; font-size: 12px;">
              Tribe<span style="color: #9EE551;">.</span> &mdash; ${tagline}
            </p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logError(error, { route: '/api/send-guest-confirmation', action: 'send_email' });
    return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 });
  }
}
