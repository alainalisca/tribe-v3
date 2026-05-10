/**
 * POST /api/users/block
 *
 * Block another user. Authenticated only — the calling user is the
 * blocker. The blocked-user table's RLS enforces auth.uid() = user_id
 * on insert; this route uses the user's own session client (not service
 * role) so RLS does the right thing automatically.
 *
 * Body: { targetUserId: string, reason?: string }
 * Response: 200 { success: true, id }, 400/401/500 with { error }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { blockUser } from '@/lib/dal/blockedUsers';

const MAX_REASON_LEN = 1000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: { targetUserId?: unknown; reason?: unknown };
    try {
      body = (await request.json()) as { targetUserId?: unknown; reason?: unknown };
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';
    if (!targetUserId) {
      return NextResponse.json({ error: 'target_user_id_required' }, { status: 400 });
    }
    if (targetUserId === user.id) {
      return NextResponse.json({ error: 'cannot_block_self' }, { status: 400 });
    }

    const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reasonRaw.length > MAX_REASON_LEN) {
      return NextResponse.json({ error: 'reason_too_long' }, { status: 400 });
    }
    const reason = reasonRaw.length > 0 ? reasonRaw : null;

    const result = await blockUser(supabase, user.id, targetUserId, reason);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'block_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, id: result.data?.id });
  } catch (error) {
    logError(error, { route: '/api/users/block' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
