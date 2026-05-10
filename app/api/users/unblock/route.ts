/**
 * POST /api/users/unblock
 *
 * Unblock a previously blocked user. Idempotent — unblocking someone
 * who isn't blocked returns success.
 *
 * Body: { targetUserId: string }
 * Response: 200 { success: true }, 400/401/500 with { error }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { unblockUser } from '@/lib/dal/blockedUsers';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: { targetUserId?: unknown };
    try {
      body = (await request.json()) as { targetUserId?: unknown };
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';
    if (!targetUserId) {
      return NextResponse.json({ error: 'target_user_id_required' }, { status: 400 });
    }

    const result = await unblockUser(supabase, user.id, targetUserId);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'unblock_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/users/unblock' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
