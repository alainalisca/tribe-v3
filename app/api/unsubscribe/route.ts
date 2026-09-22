import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { userForUnsubToken, setEmailUnsubscribed } from '@/lib/dal/emailUnsubscribe';
import { logError } from '@/lib/logger';

/**
 * @description Turns off all Tribe email for the holder of a single-use unsubscribe token.
 * @method GET
 * @auth None, by necessity -- an unsubscribe link is clicked from an inbox,
 *       where there is no session. The token IS the authorization: 128 bits
 *       from crypto.randomBytes, issued to one person for one campaign.
 *
 * WHY THIS EXISTS AT ALL: before migration 188 this app had no unsubscribe
 * route, no List-Unsubscribe header and no suppression table. email_enabled
 * looks like an opt-out and is not one -- 037 defaulted it false and 151
 * backfilled a row for every user, so its value is uniform and carries no
 * information about anybody's wishes. There was nowhere for a person to say
 * stop. Sending a campaign before building this would have been asking people
 * to accept mail they had no way to decline.
 *
 * It is idempotent: a second click, a prefetch by a mail client, or a
 * scanner following the link all land on the same already-unsubscribed state.
 * Notably this is the same email-scanner prefetch that consumed single-use
 * auth tokens and produced "link invalid or expired" -- here it is harmless
 * by construction, because the token is not consumed and the operation has
 * no second effect.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return html('Missing token.', 400);

  try {
    const supabase = getServiceRoleClient();
    const lookup = await userForUnsubToken(supabase, token);
    // A failed READ is not a bad token. Saying "unsubscribed" here would be
    // the swallowed-failure shape: the person believes they are off the list
    // and the next campaign emails them again.
    if (!lookup.success) {
      logError(new Error(lookup.error), { route: '/api/unsubscribe', action: 'lookup' });
      return html('Something went wrong. Please try again, or reply to the email and we will remove you.', 500);
    }
    if (!lookup.data) return html('This link is not valid.', 404);

    const result = await setEmailUnsubscribed(supabase, lookup.data);
    if (!result.success) {
      logError(new Error(result.error), { route: '/api/unsubscribe', action: 'set' });
      return html('Something went wrong. Please try again, or reply to the email and we will remove you.', 500);
    }
    return html('Listo. No recibirás más correos nuestros.<br>Done. You will not receive any more emails from us.');
  } catch (error) {
    logError(error, { route: '/api/unsubscribe' });
    return html('Something went wrong. Please try again, or reply to the email and we will remove you.', 500);
  }
}

/** POST is what a List-Unsubscribe-Post one-click header triggers (RFC 8058). */
export async function POST(request: Request) {
  return GET(request);
}

function html(message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#272D34">` +
      `<p style="font-size:1.05rem;line-height:1.6">${message}</p></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
