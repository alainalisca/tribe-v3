/**
 * DAL: per-user block list.
 *
 * RLS on blocked_users (migration 061) restricts visibility to the
 * blocker only — the blocked user must NOT be able to discover they were
 * blocked. The bidirectional "is either side blocking the other" check
 * goes through the is_user_blocked() RPC which is SECURITY DEFINER so
 * it can see both sides without exposing block direction to callers.
 *
 * Used by:
 *   - lib/dal/connections.ts (sendConnectionRequest) to prevent
 *     connections between blocked pairs.
 *   - app/api/users/[id]/block (POST/DELETE) for the user-facing
 *     block/unblock actions.
 *   - app/settings/blocked for the user's block list view.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface BlockedUserRow {
  id: string;
  user_id: string;
  blocked_user_id: string;
  reason: string | null;
  created_at: string;
}

export interface BlockedUserWithProfile extends BlockedUserRow {
  blocked_user: {
    id: string;
    name: string | null;
    avatar_url: string | null;
  } | null;
}

/**
 * Block another user. Idempotent: re-blocking the same user is a no-op
 * (UNIQUE constraint catches it; we map the 23505 to success rather
 * than surfacing a confusing "duplicate" error to the UI).
 */
export async function blockUser(
  supabase: SupabaseClient,
  blockerUserId: string,
  blockedUserId: string,
  reason?: string | null
): Promise<DalResult<{ id: string }>> {
  if (blockerUserId === blockedUserId) {
    return { success: false, error: 'cannot_block_self' };
  }
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .insert({
        user_id: blockerUserId,
        blocked_user_id: blockedUserId,
        reason: reason ?? null,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        // Already blocked — idempotent success. Re-fetch the existing row id.
        const { data: existing } = await supabase
          .from('blocked_users')
          .select('id')
          .eq('user_id', blockerUserId)
          .eq('blocked_user_id', blockedUserId)
          .single();
        return { success: true, data: { id: (existing as { id: string } | null)?.id ?? '' } };
      }
      logError(error, { action: 'blockUser', blockerUserId, blockedUserId });
      return { success: false, error: error.message };
    }
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'blockUser', blockerUserId, blockedUserId });
    return { success: false, error: 'Failed to block user' };
  }
}

/** Unblock a user. Idempotent — unblocking someone who isn't blocked is success. */
export async function unblockUser(
  supabase: SupabaseClient,
  blockerUserId: string,
  blockedUserId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('user_id', blockerUserId)
      .eq('blocked_user_id', blockedUserId);

    if (error) {
      logError(error, { action: 'unblockUser', blockerUserId, blockedUserId });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'unblockUser', blockerUserId, blockedUserId });
    return { success: false, error: 'Failed to unblock user' };
  }
}

/**
 * List the caller's block list with the blocked user's basic profile.
 * RLS limits the result to rows where auth.uid() = user_id.
 */
export async function listBlockedUsers(supabase: SupabaseClient): Promise<DalResult<BlockedUserWithProfile[]>> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select(
        'id, user_id, blocked_user_id, reason, created_at, blocked_user:users!blocked_user_id(id, name, avatar_url)'
      )
      .order('created_at', { ascending: false });

    if (error) {
      logError(error, { action: 'listBlockedUsers' });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as unknown as BlockedUserWithProfile[] };
  } catch (error) {
    logError(error, { action: 'listBlockedUsers' });
    return { success: false, error: 'Failed to list blocked users' };
  }
}

/**
 * Bidirectional block check via the is_user_blocked() RPC. Returns true
 * if EITHER user has blocked the other. The RPC is SECURITY DEFINER so
 * this works regardless of which side calls it.
 */
export async function isUserBlocked(
  supabase: SupabaseClient,
  userA: string,
  userB: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase.rpc('is_user_blocked', {
      p_user_a: userA,
      p_user_b: userB,
    });
    if (error) {
      logError(error, { action: 'isUserBlocked', userA, userB });
      return { success: false, error: error.message };
    }
    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'isUserBlocked', userA, userB });
    return { success: false, error: 'Failed to check block status' };
  }
}
