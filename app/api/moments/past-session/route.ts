import { NextResponse } from 'next/server';
import { isMomentsEnabled } from '@/lib/features/moments';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { PRIVATE, fail, signedInUser } from '@/lib/moments/routeGuard';
import { checkPastSession, type PastSessionInput } from '@/lib/moments/pastSession';
import { isVisibleUser } from '@/lib/dal/visibleUsers';
import { logError } from '@/lib/logger';

/**
 * POST /api/moments/past-session/ (T-MOM1): "Registrar sesión pasada". Written
 * with the service role after the check (an admin registers for a coach,
 * which the client's own insert could not), so no client-side hook runs: no
 * notification, no card warm-up. Answers the new session's id; the screen
 * goes straight to its photo upload.
 */
export async function POST(req: Request) {
  if (!isMomentsEnabled()) return fail(404, 'not_found');
  const user = await signedInUser();
  if (!user) return fail(401, 'unauthorized');
  const input = (await req.json().catch(() => null)) as PastSessionInput | null;
  if (!input) return fail(400, 'invalid_body');
  const service = getServiceRoleClient();
  try {
    const { data: actor } = await service
      .from('users')
      .select('is_admin, is_instructor')
      .eq('id', user.id)
      .maybeSingle();
    const a = actor as { is_admin: boolean | null; is_instructor: boolean | null } | null;
    let hostOk = false;
    if (input.hostId && input.hostId !== user.id) {
      const { data: host } = await service
        .from('users')
        .select('id, is_instructor, is_test_account, banned, deleted_at')
        .eq('id', input.hostId)
        .maybeSingle();
      const h = host as {
        is_instructor: boolean | null;
        is_test_account: boolean | null;
        banned: boolean | null;
        deleted_at: string | null;
      } | null;
      hostOk = !!h?.is_instructor && isVisibleUser(h);
    }
    const check = checkPastSession(
      input,
      { id: user.id, isAdmin: !!a?.is_admin, isInstructor: !!a?.is_instructor },
      () => hostOk
    );
    if (!check.ok) return fail(check.error === 'not_allowed' ? 403 : 400, check.error);
    const { data, error } = await service.from('sessions').insert(check.row).select('id').single();
    if (error) throw error;
    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201, headers: PRIVATE });
  } catch (error) {
    logError(error, { action: 'moments.pastSession' });
    return fail(500, 'create_failed');
  }
}
