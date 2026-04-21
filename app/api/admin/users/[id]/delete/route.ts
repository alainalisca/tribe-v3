/**
 * POST /api/admin/users/[id]/delete
 *
 * QA-18 (original): delete-user was running from the browser with the anon
 * client and hitting RLS. Admin cascade-delete needs a server route that
 * (a) verifies the caller is admin via lib/admin.isAdmin(), and (b) uses the
 * service-role client to bypass RLS for the cascade.
 *
 * AUDIT-P0-5 (2026-04-21): cascade was non-atomic. Three separate
 * `.delete()` calls wrapped in Promise.allSettled, then an unconditional
 * soft-delete on the users row. Two bugs:
 *
 *   1. Supabase `.delete()` returns `{ data, error }` rather than throwing,
 *      so allSettled's `status === 'rejected'` branch never caught DB errors.
 *   2. Even without bug 1, three statements aren't atomic; a mid-cascade
 *      failure left orphan rows.
 *
 * Fix: call the `admin_delete_user` RPC (migration 050) which runs the
 * whole cascade + soft-delete in one transaction and returns a jsonb
 * {success, error} shape. Any DB error rolls back everything.
 */
import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/admin';
import { logError } from '@/lib/logger';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json({ error: 'missing_user_id' }, { status: 400 });
    }

    // Authorization — only admins can call this. The RPC itself does NOT
    // re-check admin; it's fenced by this handler.
    const authorized = await isAdmin();
    if (!authorized) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Single atomic cascade via the admin_delete_user RPC (migration 050).
    const { data, error } = await service.rpc('admin_delete_user', {
      p_target_user_id: targetUserId,
    });

    if (error) {
      logError(error, { action: 'adminDeleteUser.rpc', targetUserId });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The RPC returns a jsonb body: { success, error?, code?, id? }.
    const result = data as { success: boolean; error?: string; code?: string; id?: string };

    if (!result.success) {
      logError(new Error(result.error ?? 'admin_delete_user failed'), {
        action: 'adminDeleteUser.rpcResult',
        targetUserId,
        code: result.code,
      });
      const status = result.error === 'user_not_found' ? 404 : 500;
      return NextResponse.json({ error: result.error ?? 'delete_failed' }, { status });
    }

    return NextResponse.json({ success: true, id: result.id ?? targetUserId });
  } catch (error) {
    logError(error, { action: 'adminDeleteUser.route' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
