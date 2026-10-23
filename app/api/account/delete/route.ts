/**
 * POST /api/account/delete
 *
 * Deletes the *authenticated caller's own* account. Auth-user deletion
 * needs the service-role key and therefore MUST run server-side — the
 * old client-side path (deleteUser in the settings hook) referenced
 * SUPABASE_SERVICE_ROLE_KEY in the browser where it is undefined, so
 * the auth user was never deleted and accounts became zombies.
 *
 * Auth: Bearer token (Supabase user access token). The user id to
 * delete is derived from the verified token, never from the body —
 * a caller can only delete themselves.
 *
 * T-DEL1: the deletion itself is lib/account/deleteAccount, the same path the
 * admin route runs. A failure names its step ({ success: false, step }); every
 * step is safe to run again, so trying again finishes a delete that stopped.
 *
 * ACCOUNTS ARE DELETED ONLY HERE (the app's Settings or the admin page), never
 * from the Supabase Auth dashboard. Since migration 228 the profile no longer
 * cascades from the login: deleting a user in the dashboard removes the login
 * and leaves the profile, their files and their personal data behind, with
 * nothing to show it happened. To finish one deleted that way, run the admin
 * delete on the profile: every step is safe to repeat.
 */
import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { deleteAccount } from '@/lib/account/deleteAccount';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Missing authorization header' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length);

    const service = getServiceRoleClient();

    const {
      data: { user },
      error: authErr,
    } = await service.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Invalid or expired token' }, { status: 401 });
    }

    const result = await deleteAccount(service, user.id);
    if (!result.ok) {
      logError(new Error(result.error), { route: '/api/account/delete', step: result.step, userId: user.id });
      // A gym or partner-listing owner is told why; anything else is a stop partway.
      const refused = result.error === 'owns_gym' || result.error === 'owns_partner';
      const error = refused ? result.error : 'delete_failed';
      return NextResponse.json({ success: false, error, step: result.step }, { status: refused ? 409 : 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/account/delete' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
