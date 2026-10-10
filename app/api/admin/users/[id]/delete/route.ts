/**
 * POST /api/admin/users/[id]/delete
 *
 * QA-18 (original): delete-user was running from the browser with the anon
 * client and hitting RLS. Admin cascade-delete needs a server route that
 * (a) verifies the caller is admin, and (b) uses the service-role client to
 * bypass RLS for the cascade.
 *
 * AUDIT-P0-5 (2026-04-21): cascade was non-atomic. Fix: call the
 * `admin_delete_user` RPC (migration 050) which runs the whole cascade +
 * soft-delete in one transaction and returns a jsonb {success, error} shape.
 * Any DB error rolls back everything.
 *
 * 2026-10-10: the gate was `isAdmin()` (the ADMIN_EMAILS allowlist) while the
 * /admin page gates on `is_app_admin()`. For a DB admin not on the list the
 * route 403'd silently, which is why the Delete button was pulled from the user
 * list. The route now uses requireApiAdmin(), the same check the page uses, so
 * the button can come back. Two refusals were added at the same time:
 *   - an admin cannot delete their own account from here (one mis-tap would
 *     lock them out of the panel they are using), and
 *   - an admin account cannot be deleted from here at all. Demote it first.
 */
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { logError, log } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Gate first: nothing is read until the caller is a confirmed admin. The RPC
  // itself does NOT re-check admin; it is fenced by this handler.
  const gate = await requireApiAdmin();
  if (!gate.ok) return gate.response;

  try {
    const { id: targetUserId } = await params;
    if (!targetUserId || !UUID_RE.test(targetUserId)) {
      return NextResponse.json({ error: 'missing_user_id' }, { status: 400 });
    }
    if (targetUserId === gate.userId) {
      return NextResponse.json({ error: 'cannot_delete_self' }, { status: 409 });
    }

    const service = gate.service;

    // Refuse admin targets. Fail closed: if this read errors, nothing is deleted.
    const { data: target, error: targetErr } = await service
      .from('users')
      .select('id, is_admin, deleted_at')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetErr) {
      logError(targetErr, { action: 'adminDeleteUser.target', targetUserId });
      return NextResponse.json({ error: 'check_failed' }, { status: 500 });
    }
    if (!target || target.deleted_at) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }
    if (target.is_admin === true) {
      return NextResponse.json({ error: 'target_is_admin' }, { status: 409 });
    }

    // Single atomic cascade via the admin_delete_user RPC (migration 050).
    const { data, error } = await service.rpc('admin_delete_user', {
      p_target_user_id: targetUserId,
    });

    if (error) {
      logError(error, { action: 'adminDeleteUser.rpc', targetUserId });
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    // The RPC returns a jsonb body: { success, error?, code?, id? }.
    const result = data as { success: boolean; error?: string; code?: string; id?: string } | null;

    if (!result?.success) {
      logError(new Error(result?.error ?? 'admin_delete_user failed'), {
        action: 'adminDeleteUser.rpcResult',
        targetUserId,
        code: result?.code,
      });
      const status = result?.error === 'user_not_found' ? 404 : 500;
      return NextResponse.json(
        { error: result?.error === 'user_not_found' ? 'user_not_found' : 'delete_failed' },
        { status }
      );
    }

    log('info', 'admin deleted user', { action: 'adminDeleteUser', actorUserId: gate.userId, targetUserId });
    return NextResponse.json({ success: true, id: result.id ?? targetUserId });
  } catch (error) {
    logError(error, { action: 'adminDeleteUser.route' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
