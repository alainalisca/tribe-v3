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
 * List all coaches in a gym with their display profiles. Ordered with
 * the owner first, then everyone else by created_at asc.
 */
export async function listCoachesForGym(
  supabase: SupabaseClient,
  gymId: string
): Promise<DalResult<GymCoachWithUser[]>> {
  try {
    const { data, error } = await supabase
      .from('gym_coaches')
      .select(`${COACH_SELECT}, user:users(id, name, email, avatar_url)`)
      .eq('gym_id', gymId)
      .order('created_at', { ascending: true });

    if (error) {
      logError(error, { action: 'listCoachesForGym', gymId });
      return { success: false, error: error.message };
    }

    const rows = ((data ?? []) as unknown as GymCoachWithUser[]).slice();
    rows.sort((a, b) => {
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (b.role === 'owner' && a.role !== 'owner') return 1;
      return a.created_at.localeCompare(b.created_at);
    });
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
