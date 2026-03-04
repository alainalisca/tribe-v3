/** DAL: session_participants table — join, leave, accept/decline */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { SessionParticipantInsert } from '@/lib/database.types';

export async function insertParticipant(
  supabase: SupabaseClient,
  data: SessionParticipantInsert
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_participants').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertParticipant' });
    return { success: false, error: 'Failed to insert participant' };
  }
}

export async function updateParticipantStatus(
  supabase: SupabaseClient,
  id: string,
  status: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_participants').update({ status }).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateParticipantStatus' });
    return { success: false, error: 'Failed to update participant' };
  }
}

export async function deleteParticipant(supabase: SupabaseClient, id: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_participants').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteParticipant' });
    return { success: false, error: 'Failed to delete participant' };
  }
}

export async function deleteParticipantsByUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_participants').delete().eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteParticipantsByUser' });
    return { success: false, error: 'Failed to delete participants' };
  }
}

export async function fetchParticipantUserIds(supabase: SupabaseClient): Promise<DalResult<string[]>> {
  try {
    const { data, error } = await supabase.from('session_participants').select('user_id');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map((d) => d.user_id).filter(Boolean) as string[] };
  } catch (error) {
    logError(error, { action: 'fetchParticipantUserIds' });
    return { success: false, error: 'Failed to fetch participant user IDs' };
  }
}

// REASON: returns raw Supabase join shape — callers handle type narrowing
export async function fetchConfirmedParticipantsWithUsers(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<unknown[]>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select('user_id, status, is_guest, guest_name, user:users(id, name, avatar_url)')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchConfirmedParticipantsWithUsers' });
    return { success: false, error: 'Failed' };
  }
}

/** Count sessions a user has joined. */
export async function fetchParticipantCountForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchParticipantCountForUser' });
    return { success: false, error: 'Failed' };
  }
}

/** Get confirmed participant user IDs for a session, optionally excluding one user. */
export async function fetchParticipantUserIdsForSession(
  supabase: SupabaseClient,
  sessionId: string,
  excludeUserId?: string
): Promise<DalResult<string[]>> {
  try {
    let query = supabase
      .from('session_participants')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');
    if (excludeUserId) query = query.neq('user_id', excludeUserId);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map((d) => d.user_id).filter(Boolean) as string[] };
  } catch (error) {
    logError(error, { action: 'fetchParticipantUserIdsForSession' });
    return { success: false, error: 'Failed' };
  }
}

/** Delete guest participants for a session. */
export async function deleteGuestParticipantsForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('session_participants')
      .delete()
      .eq('session_id', sessionId)
      .eq('is_guest', true);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteGuestParticipantsForSession' });
    return { success: false, error: 'Failed' };
  }
}

// REASON: returns raw Supabase join shape for cron/weekly recap queries
export async function fetchParticipationsWithSession(
  supabase: SupabaseClient,
  userId: string,
  opts?: { dateGte?: string; dateLte?: string; status?: string; userJoinFields?: string }
): Promise<DalResult<unknown[]>> {
  try {
    const joinFields = opts?.userJoinFields || 'session_id, sessions!inner(date, sport, duration)';
    let query = supabase.from('session_participants').select(joinFields).eq('user_id', userId);
    if (opts?.status) query = query.eq('status', opts.status);
    if (opts?.dateGte) query = query.gte('sessions.date', opts.dateGte);
    if (opts?.dateLte) query = query.lte('sessions.date', opts.dateLte);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchParticipationsWithSession' });
    return { success: false, error: 'Failed' };
  }
}

// REASON: returns raw Supabase join shape — callers handle type narrowing
/** Fetch participants with user details (for cron session reminders). */
export async function fetchParticipantsWithUserDetails(
  supabase: SupabaseClient,
  sessionId: string,
  userFields?: string
): Promise<DalResult<unknown[]>> {
  try {
    const fields = userFields || 'id, preferred_language, session_reminders_enabled';
    const { data, error } = await supabase
      .from('session_participants')
      .select(`user_id, user:users!session_participants_user_id_fkey(${fields})`)
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchParticipantsWithUserDetails' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch sessions a user participates in (for messages page). */
export async function fetchParticipantSessionIds(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<string[]>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', userId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map((d) => d.session_id).filter(Boolean) };
  } catch (error) {
    logError(error, { action: 'fetchParticipantSessionIds' });
    return { success: false, error: 'Failed' };
  }
}

/** Delete a participant by session + user compound key. */
export async function deleteParticipantBySessionAndUser(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('session_participants')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteParticipantBySessionAndUser' });
    return { success: false, error: 'Failed' };
  }
}

/** Insert a participant and return the created row. */
export async function insertParticipantReturning(
  supabase: SupabaseClient,
  data: SessionParticipantInsert
): Promise<DalResult<unknown>> {
  try {
    const { data: row, error } = await supabase.from('session_participants').insert(data).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: row };
  } catch (error) {
    logError(error, { action: 'insertParticipantReturning' });
    return { success: false, error: 'Failed' };
  }
}

/** Check if a user already participates in a session. */
export async function checkExistingParticipation(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<unknown | null>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'checkExistingParticipation' });
    return { success: false, error: 'Failed' };
  }
}

/** Delete guest participants by guest token or phone. */
export async function deleteGuestParticipant(
  supabase: SupabaseClient,
  sessionId: string,
  filter: { guest_token?: string; guest_phone?: string }
): Promise<DalResult<null>> {
  try {
    let query = supabase.from('session_participants').delete().eq('session_id', sessionId).eq('is_guest', true);
    if (filter.guest_token) query = query.eq('guest_token', filter.guest_token);
    if (filter.guest_phone) query = query.eq('guest_phone', filter.guest_phone);
    const { error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteGuestParticipant' });
    return { success: false, error: 'Failed' };
  }
}

/** Check guest status by phone or email. */
export async function fetchGuestParticipant(
  supabase: SupabaseClient,
  sessionId: string,
  filter: { guest_phone?: string; guest_email?: string }
): Promise<DalResult<unknown | null>> {
  try {
    let query = supabase.from('session_participants').select('*').eq('session_id', sessionId).eq('is_guest', true);
    if (filter.guest_phone) query = query.eq('guest_phone', filter.guest_phone);
    if (filter.guest_email) query = query.eq('guest_email', filter.guest_email);
    const { data, error } = await query.maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchGuestParticipant' });
    return { success: false, error: 'Failed' };
  }
}

// REASON: returns raw Supabase join shape — callers handle type narrowing
/** Fetch pending participants with user details for multiple sessions. */
export async function fetchPendingParticipantsForSessions(
  supabase: SupabaseClient,
  sessionIds: string[]
): Promise<DalResult<unknown[]>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select('*, user:users(id, name, avatar_url)')
      .in('session_id', sessionIds)
      .eq('status', 'pending');
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchPendingParticipantsForSessions' });
    return { success: false, error: 'Failed' };
  }
}
