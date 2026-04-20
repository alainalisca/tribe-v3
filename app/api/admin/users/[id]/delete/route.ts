/**
 * POST /api/admin/users/[id]/delete
 *
 * QA-18: delete-user was running from the browser with the anon client and
 * hitting RLS. Admin cascade-delete needs a server route that (a) verifies
 * the caller is admin via lib/admin.isAdmin(), and (b) uses the service-role
 * client to bypass RLS for the cascade.
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

    // Authorization — only admins can call this.
    const authorized = await isAdmin();
    if (!authorized) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    // Service-role client bypasses RLS for the cascade.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Cascade order: chat messages → participants → sessions → user row.
    // ON DELETE CASCADE handles most of it at the DB level, but the explicit
    // calls guarantee a clean slate across older tables without cascade.
    const results = await Promise.allSettled([
      service.from('chat_messages').delete().eq('user_id', targetUserId),
      service.from('session_participants').delete().eq('user_id', targetUserId),
      service.from('sessions').delete().eq('creator_id', targetUserId),
    ]);

    for (const r of results) {
      if (r.status === 'rejected') {
        logError(r.reason, { action: 'adminDeleteUser.cascade', targetUserId });
      }
    }

    // Soft-delete the user row. auth.users is left alone — admin can hard-delete
    // through the Supabase dashboard if they need to release the email.
    const { error: userErr } = await service
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', targetUserId);

    if (userErr) {
      logError(userErr, { action: 'adminDeleteUser.softDelete', targetUserId });
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: targetUserId });
  } catch (error) {
    logError(error, { action: 'adminDeleteUser.route' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
