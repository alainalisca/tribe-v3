/** DAL: users table — profile reads, updates, admin checks */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult, UserForNotification } from './types';
import type { User as UserRow, UserUpdate } from '@/lib/database.types';

export async function fetchUserProfile(supabase: SupabaseClient, userId: string): Promise<DalResult<UserRow>> {
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchUserProfile' });
    return { success: false, error: 'Failed to fetch user' };
  }
}

export async function fetchUserIsAdmin(supabase: SupabaseClient, userId: string): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase.from('users').select('is_admin').eq('id', userId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: !!data?.is_admin };
  } catch (error) {
    logError(error, { action: 'fetchUserIsAdmin' });
    return { success: false, error: 'Failed to check admin status' };
  }
}

/** Fetch all admin user IDs (for sending admin notifications) */
export async function fetchAdminUserIds(supabase: SupabaseClient): Promise<DalResult<string[]>> {
  try {
    const { data, error } = await supabase.from('users').select('id').eq('is_admin', true);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []).map((u) => u.id) };
  } catch (error) {
    logError(error, { action: 'fetchAdminUserIds' });
    return { success: false, error: 'Failed to fetch admin user IDs' };
  }
}

export async function fetchUserName(supabase: SupabaseClient, userId: string): Promise<DalResult<string>> {
  try {
    const { data, error } = await supabase.from('users').select('name').eq('id', userId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data?.name || '' };
  } catch (error) {
    logError(error, { action: 'fetchUserName' });
    return { success: false, error: 'Failed to fetch user name' };
  }
}

export async function fetchUserField(
  supabase: SupabaseClient,
  userId: string,
  field: string
  // REASON: dynamic field access — callers know the expected return type
): Promise<DalResult<unknown>> {
  try {
    const { data, error } = await supabase.from('users').select(field).eq('id', userId).single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as Record<string, unknown>)?.[field] };
  } catch (error) {
    logError(error, { action: 'fetchUserField', field });
    return { success: false, error: `Failed to fetch ${field}` };
  }
}

export async function fetchUsersByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<DalResult<Array<{ id: string; name: string; avatar_url: string | null }>>> {
  try {
    const { data, error } = await supabase.from('users').select('id, name, avatar_url').in('id', ids);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUsersByIds' });
    return { success: false, error: 'Failed to fetch users' };
  }
}

export async function updateUser(supabase: SupabaseClient, userId: string, data: UserUpdate): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('users').update(data).eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateUser' });
    return { success: false, error: 'Failed to update user' };
  }
}

export async function updateUsersByIds(
  supabase: SupabaseClient,
  ids: string[],
  data: UserUpdate
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('users').update(data).in('id', ids);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateUsersByIds' });
    return { success: false, error: 'Failed to update users' };
  }
}

/** @deprecated Use softDeleteUser instead for GDPR-compliant account deletion */
export async function deleteUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  return softDeleteUser(supabase, userId);
}

/**
 * Soft-delete user: cancel future sessions, anonymize PII, deactivate connections.
 * Preserves the record for audit trail while removing personal data.
 */
export async function softDeleteUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    // 1. Cancel all future sessions this user created
    const { data: futureSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('creator_id', userId)
      .gte('date', new Date().toISOString())
      .in('status', ['active', 'upcoming']);

    for (const session of futureSessions || []) {
      await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', session.id);
    }

    // 2. Remove user from future session participations
    await supabase
      .from('session_participants')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'confirmed');

    // 3. Anonymize user profile (keep record, remove PII)
    await supabase
      .from('users')
      .update({
        name: 'Deleted User',
        email: `deleted-${userId}@deleted.tribe.app`,
        avatar_url: null,
        bio: null,
        phone: null,
        location_lat: null,
        location_lng: null,
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', userId);

    // 4. Deactivate connections
    await supabase
      .from('connections')
      .update({ status: 'cancelled' })
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    // 5. Remove auth user (signs them out permanently)
    const { createClient: createAdmin } = await import('@supabase/supabase-js');
    const adminClient = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await adminClient.auth.admin.deleteUser(userId);

    return { success: true };
  } catch (error) {
    logError(error, { action: 'softDeleteUser', userId });
    return { success: false, error: 'Failed to delete account' };
  }
}

export async function upsertUser(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('users').upsert(payload, { onConflict: 'id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'upsertUser' });
    return { success: false, error: 'Failed to upsert user' };
  }
}

export async function fetchUsersForAdmin(supabase: SupabaseClient): Promise<DalResult<UserRow[]>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUsersForAdmin' });
    return { success: false, error: 'Failed to fetch users' };
  }
}

/** Fetch user profile, returning null instead of error when not found. */
export async function fetchUserProfileMaybe(
  supabase: SupabaseClient,
  userId: string,
  fields?: string
): Promise<DalResult<Record<string, unknown> | null>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(fields || '*')
      .eq('id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as Record<string, unknown> | null };
  } catch (error) {
    logError(error, { action: 'fetchUserProfileMaybe' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch users with push subscription and optional filters. */
export async function fetchUsersWithPush(
  supabase: SupabaseClient,
  fields: string,
  filters?: {
    lastMotivationBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    lastReengagementBefore?: string;
    lastWeeklyRecapBefore?: string;
  }
): Promise<DalResult<unknown[]>> {
  try {
    let query = supabase.from('users').select(fields).or('push_subscription.not.is.null,fcm_token.not.is.null');
    if (filters?.lastMotivationBefore)
      query = query.or(`last_motivation_sent.is.null,last_motivation_sent.lt.${filters.lastMotivationBefore}`);
    if (filters?.updatedAfter) query = query.gte('updated_at', filters.updatedAfter);
    if (filters?.updatedBefore) query = query.lte('updated_at', filters.updatedBefore);
    if (filters?.lastReengagementBefore)
      query = query.or(`last_reengagement_sent.is.null,last_reengagement_sent.lt.${filters.lastReengagementBefore}`);
    if (filters?.lastWeeklyRecapBefore)
      query = query.or(`last_weekly_recap_sent.is.null,last_weekly_recap_sent.lt.${filters.lastWeeklyRecapBefore}`);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchUsersWithPush' });
    return { success: false, error: 'Failed' };
  }
}

/** Check if a user has blocked another user. */
export async function fetchBlockedStatus(
  supabase: SupabaseClient,
  userId: string,
  blockedUserId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('user_id', userId)
      .eq('blocked_user_id', blockedUserId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'fetchBlockedStatus' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch user with specific fields for push notification. */
export async function fetchUserForNotification(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<UserForNotification | null>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, push_subscription, preferred_language, fcm_token, native_push_token')
      .eq('id', userId)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as UserForNotification };
  } catch (error) {
    logError(error, { action: 'fetchUserForNotification' });
    return { success: false, error: 'Failed' };
  }
}
