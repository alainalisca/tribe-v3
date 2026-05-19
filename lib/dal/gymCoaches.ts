/**
 * DAL: gym_coaches — junction of users to gyms with role.
 *
 * Introduced by migration 068. The dual-path RLS layer (migration 070)
 * treats a row in this table as equivalent to legacy
 * instructor_user_id ownership on the tenant tables (clients,
 * client_attendance).
 *
 * Inline types — gym_coaches not yet in lib/database.types.ts.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { GymCoachRole } from './gyms';

export interface GymCoachRow {
  gym_id: string;
  user_id: string;
  role: GymCoachRole;
  created_at: string;
}

/** Coach row enriched with the user's display profile. */
export interface GymCoachWithUser extends GymCoachRow {
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
  /**
   * Most recent audit-log timestamp for this coach (ISO). Decorated
   * by GET /api/tribe-os/coaches from fetchLastActionByActor. Null
   * when the coach has never written an audit row (brand new, or
   * just signed up and hasn't done a forensic action yet).
   */
  last_action_at?: string | null;
}

const COACH_SELECT = 'gym_id, user_id, role, created_at';

/**
 * Add a user as a coach in a gym. Idempotent: re-adding the same
 * (gym, user) pair returns the existing row instead of erroring on
 * the primary-key conflict.
 *
 * Role policy: callers wanting to grant 'owner' should typically be
 * the service-role (created during gym provisioning) — the UI invite
 * flow should only mint 'coach' or 'assistant'.
 */
export async function addCoachToGym(
  supabase: SupabaseClient,
  gymId: string,
  userId: string,
  role: GymCoachRole = 'coach'
): Promise<DalResult<GymCoachRow>> {
  try {
    const { data, error } = await supabase
      .from('gym_coaches')
      .upsert({ gym_id: gymId, user_id: userId, role }, { onConflict: 'gym_id,user_id', ignoreDuplicates: false })
      .select(COACH_SELECT)
      .single();

    if (error) {
      logError(error, { action: 'addCoachToGym', gymId, userId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as GymCoachRow };
  } catch (error) {
    logError(error, { action: 'addCoachToGym', gymId, userId });
    return { success: false, error: 'Failed to add coach to gym' };
  }
}

/**
 * Remove a coach from a gym. Refuses to remove the gym's owner —
 * the gym must always have an owner (also enforced by the
 * ON DELETE RESTRICT on gyms.owner_user_id, but we check here to
 * give a friendlier error than a foreign-key violation).
 *
 * Transferring ownership is a separate two-step flow: add the new
 * owner as 'coach', call updateGym to flip the new owner_user_id
 * (and update their role to 'owner' via this same DAL), then
 * remove the old owner.
 */
export async function removeCoachFromGym(
  supabase: SupabaseClient,
  gymId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { data: gym, error: gymErr } = await supabase
      .from('gyms')
      .select('owner_user_id')
      .eq('id', gymId)
      .maybeSingle();
    if (gymErr) {
      logError(gymErr, { action: 'removeCoachFromGym.gymLookup', gymId, userId });
      return { success: false, error: gymErr.message };
    }
    if (!gym) {
      return { success: false, error: 'gym_not_found' };
    }
    if ((gym as { owner_user_id: string }).owner_user_id === userId) {
      return { success: false, error: 'cannot_remove_owner' };
    }

    const { error } = await supabase.from('gym_coaches').delete().eq('gym_id', gymId).eq('user_id', userId);

    if (error) {
      logError(error, { action: 'removeCoachFromGym', gymId, userId });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'removeCoachFromGym', gymId, userId });
    return { success: false, error: 'Failed to remove coach from gym' };
  }
}

/**
 * List all coaches in a gym with their display profiles. Calls the
 * SECURITY DEFINER `list_gym_coaches(p_gym_id)` function from
 * migration 073, which breaks the recursion that a direct SELECT
 * on gym_coaches would hit (the gym_coaches RLS policy was
 * collapsed to `user_id = auth.uid()` after the dd0aac5 hotfix,
 * which would otherwise restrict this query to the caller's own
 * row).
 *
 * Caller must be a coach in the gym; mismatch raises 42501 in the
 * RPC which surfaces as an error here. The function returns rows
 * already sorted (owner first, then created_at asc) so no extra
 * sort is needed.
 */
export async function listCoachesForGym(
  supabase: SupabaseClient,
  gymId: string
): Promise<DalResult<GymCoachWithUser[]>> {
  try {
    const { data, error } = await supabase.rpc('list_gym_coaches', {
      p_gym_id: gymId,
    });

    if (error) {
      logError(error, { action: 'listCoachesForGym', gymId });
      return { success: false, error: error.message };
    }

    // The RPC returns flat columns (user_name, user_email,
    // user_avatar_url) for performance — no embedded user object.
    // Reshape to the existing GymCoachWithUser interface so call
    // sites stay unchanged.
    type RpcRow = {
      gym_id: string;
      user_id: string;
      role: GymCoachRole;
      created_at: string;
      user_name: string | null;
      user_email: string | null;
      user_avatar_url: string | null;
    };

    const rows = ((data ?? []) as RpcRow[]).map(
      (r): GymCoachWithUser => ({
        gym_id: r.gym_id,
        user_id: r.user_id,
        role: r.role,
        created_at: r.created_at,
        user: r.user_name
          ? {
              id: r.user_id,
              name: r.user_name,
              email: r.user_email ?? '',
              avatar_url: r.user_avatar_url,
            }
          : null,
      })
    );

    return { success: true, data: rows };
  } catch (error) {
    logError(error, { action: 'listCoachesForGym', gymId });
    return { success: false, error: 'Failed to list coaches for gym' };
  }
}

/**
 * Check whether a user is a coach (any role) in a specific gym. Cheap
 * single-row lookup against the primary key index. Used by route
 * handlers that want to gate on gym membership before doing expensive
 * work.
 */
export async function isCoachInGym(
  supabase: SupabaseClient,
  gymId: string,
  userId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('gym_coaches')
      .select('user_id')
      .eq('gym_id', gymId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logError(error, { action: 'isCoachInGym', gymId, userId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data != null };
  } catch (error) {
    logError(error, { action: 'isCoachInGym', gymId, userId });
    return { success: false, error: 'Failed to check coach membership' };
  }
}

/**
 * Every user_id that "belongs to" a gym: the owner (gyms.owner_user_id)
 * plus every gym_coaches.user_id. Deduped.
 *
 * Used to gym-scope tables that key off the session/record CREATOR
 * rather than gym_id (notably `sessions`, which has no gym_id column).
 * Without this, /os/schedule and the dashboard "sessions today" KPI
 * filter by the caller's own creator_id — so a non-owner coach sees an
 * empty schedule while the rest of their OS populates, and a
 * multi-coach owner never sees co-coaches' classes.
 */
export async function listGymMemberUserIds(supabase: SupabaseClient, gymId: string): Promise<DalResult<string[]>> {
  try {
    const ids = new Set<string>();

    const { data: gymRow, error: gymErr } = await supabase
      .from('gyms')
      .select('owner_user_id')
      .eq('id', gymId)
      .maybeSingle();
    if (gymErr) {
      logError(gymErr, { action: 'listGymMemberUserIds.owner', gymId });
      return { success: false, error: gymErr.message };
    }
    const ownerId = (gymRow as { owner_user_id: string } | null)?.owner_user_id;
    if (ownerId) ids.add(ownerId);

    const { data: coachRows, error: coachErr } = await supabase
      .from('gym_coaches')
      .select('user_id')
      .eq('gym_id', gymId);
    if (coachErr) {
      logError(coachErr, { action: 'listGymMemberUserIds.coaches', gymId });
      return { success: false, error: coachErr.message };
    }
    for (const r of (coachRows ?? []) as Array<{ user_id: string }>) {
      if (r.user_id) ids.add(r.user_id);
    }

    return { success: true, data: Array.from(ids) };
  } catch (error) {
    logError(error, { action: 'listGymMemberUserIds', gymId });
    return { success: false, error: 'Failed to list gym member user ids' };
  }
}
