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
 */
import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { softDeleteUser } from '@/lib/dal/users';

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

    // 1. Data steps (cancel future sessions, anonymize PII, deactivate
    //    connections). Run with the service client so RLS can't block any
    //    step mid-way and leave a half-deleted record.
    const dataRes = await softDeleteUser(service, user.id);
    if (!dataRes.success) {
      logError(new Error(dataRes.error ?? 'soft_delete_failed'), { route: '/api/account/delete', userId: user.id });
      return NextResponse.json({ success: false, error: 'Failed to delete account data' }, { status: 500 });
    }

    // 2. Hard-delete the auth user (server-side, service role). This is
    //    the step that was silently failing in the browser.
    const { error: adminErr } = await service.auth.admin.deleteUser(user.id);
    if (adminErr) {
      // Data is already anonymized; surface the failure so we don't claim
      // a clean delete. The auth user can be retried.
      logError(adminErr, { route: '/api/account/delete', action: 'auth_admin_delete', userId: user.id });
      return NextResponse.json({ success: false, error: 'Failed to remove login' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/account/delete' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
