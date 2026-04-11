import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

const ADMIN_EMAIL = 'tribe@aplusfitnessllc.com';

interface AdminSignupNotificationBody {
  userName: string;
  userEmail: string;
  signupMethod: 'Email' | 'Google' | 'Apple';
}

/**
 * @description Sends an email to the admin when a new user signs up.
 * @method POST
 * @auth None required — called fire-and-forget from the client after signup.
 * @param {AdminSignupNotificationBody} request.body - New user details.
 * @returns {{ success: boolean }} 200 on success, 400 if required fields are missing, 500 on failure.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: max 5 signup notifications per minute per IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const { allowed } = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = (await request.json()) as AdminSignupNotificationBody;
    const { userName, userEmail, signupMethod } = body;

    if (!userName || !userEmail || !signupMethod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const resend = getResendClient();
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    await resend.emails.send({
      from: 'Tribe <tribe@aplusfitnessllc.com>',
      to: ADMIN_EMAIL,
      subject: `New Tribe signup: ${userName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 20px;">
          <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <h1 style="font-size: 28px; margin: 0;">Tribe<span style="color: #9EE551;">.</span></h1>
              <p style="color: #9EE551; font-weight: 600; margin: 5px 0;">New Account Created</p>
            </div>

            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #9EE551;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #6b7280; padding: 6px 12px 6px 0; font-size: 14px; white-space: nowrap;">Name</td>
                  <td style="color: #1e293b; padding: 6px 0; font-weight: 600; font-size: 14px;">${userName}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 6px 12px 6px 0; font-size: 14px; white-space: nowrap;">Email</td>
                  <td style="color: #1e293b; padding: 6px 0; font-weight: 600; font-size: 14px;">${userEmail}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 6px 12px 6px 0; font-size: 14px; white-space: nowrap;">Method</td>
                  <td style="color: #1e293b; padding: 6px 0; font-weight: 600; font-size: 14px;">${signupMethod}</td>
                </tr>
                <tr>
                  <td style="color: #6b7280; padding: 6px 12px 6px 0; font-size: 14px; white-space: nowrap;">Time</td>
                  <td style="color: #1e293b; padding: 6px 0; font-weight: 600; font-size: 14px;">${timestamp}</td>
                </tr>
              </table>
            </div>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logError(error, { route: '/api/notify-admin-signup', action: 'send_email' });
    return NextResponse.json({ error: 'Failed to send admin notification' }, { status: 500 });
  }
}
