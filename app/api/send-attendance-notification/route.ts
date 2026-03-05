import { createClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { fetchSessionFields, fetchUserProfileMaybe } from '@/lib/dal';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';

/**
 * @description Sends a post-session attendance notification email prompting the user to upload photos from their training session.
 * @method POST
 * @auth Required - validates the caller is authenticated via Supabase auth.
 * @param {Object} request.body - JSON body with `sessionId` (string) and `userId` (string) identifying the session and recipient.
 * @returns {{ success: boolean }} 200 on success, 401 if unauthenticated, 400 if session or user email is missing.
 */
export async function POST(request: Request) {
  try {
    const resend = getResendClient();
    // AUTH: verify the caller is authenticated
    const supabase = await createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId, userId } = await request.json();

    // Get session details
    const sessionResult = await fetchSessionFields(supabase, sessionId, '*, creator:users!creator_id(name)');
    const session = sessionResult.data as {
      id: string;
      sport: string;
      location: string;
      date: string;
      creator: { name: string } | null;
    } | null;

    // Get user details including language preference
    const userResult = await fetchUserProfileMaybe(supabase, userId, 'name, email, preferred_language');
    const user = userResult.data as { name: string; email: string; preferred_language: string | null } | null;

    if (!session || !user?.email) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const lang = user.preferred_language || 'en';
    const isSpanish = lang === 'es';

    // Bilingual content
    const subject = isSpanish
      ? `🎉 ¡Comparte tus fotos de ${session.sport}!`
      : `🎉 Share your ${session.sport} session photos!`;

    const greeting = isSpanish ? `¡Gran sesión, ${user.name}! 🎉` : `Great session, ${user.name}! 🎉`;

    const thanks = isSpanish
      ? `Gracias por unirte a <strong>${session.sport}</strong> en ${session.location}. ¡Nunca entrenes solo!`
      : `Thanks for joining <strong>${session.sport}</strong> at ${session.location}. Never train alone!`;

    const sharePrompt = isSpanish
      ? `Comparte tus fotos de la sesión de hoy para ayudar a construir nuestra comunidad.`
      : `Share your photos from today's session to help build our community.`;

    const buttonText = isSpanish ? 'Subir Fotos' : 'Upload Photos';

    const photoLimit = isSpanish
      ? `Puedes subir hasta 3 fotos de esta sesión.`
      : `You can upload up to 3 photos from this session.`;

    const hostedBy = isSpanish
      ? `Organizado por ${session.creator?.name || 'Comunidad Tribe'}`
      : `Hosted by ${session.creator?.name || 'Tribe Community'}`;

    const tagline = isSpanish ? 'Nunca Entrenes Solo' : 'Never Train Alone';

    // Send email
    await resend.emails.send({
      from: 'Tribe <tribe@aplusfitnessllc.com>',
      to: user.email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
              <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">${tagline}</p>
            </div>
            
            <h2 style="color: #1e293b; margin-bottom: 15px;">${greeting}</h2>
            
            <p style="color: #374151; line-height: 1.6;">${thanks}</p>
            
            <p style="color: #374151; line-height: 1.6;">${sharePrompt}</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${SITE_URL}/session/${sessionId}" 
                 style="display: inline-block; background: #9EE551; color: #1e293b; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                ${buttonText}
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">
              ${photoLimit}
            </p>
            
            <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                ${hostedBy}
              </p>
            </div>
          </div>
          
          <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 20px;">
            © ${new Date().getFullYear()} Tribe · ${tagline}
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/send-attendance-notification', action: 'send_email' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
