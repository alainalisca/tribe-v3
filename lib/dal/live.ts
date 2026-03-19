/** DAL: live_status + session_attendance tables */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult, LiveUserWithDetails } from './types';
import type { Database } from '@/lib/database.types';

type LiveStatusRow = Database['public']['Tables']['live_status']['Row'];
type AttendanceInsert = Database['public']['Tables']['session_attendance']['Insert'];

export async function upsertLiveStatus(
  supabase: SupabaseClient,
  data: Partial<LiveStatusRow> & { user_id: string; session_id: string }
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('live_status').upsert(data, { onConflict: 'user_id,session_id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'upsertLiveStatus' });
    return { success: false, error: 'Failed to update live status' };
  }
}

export async function deleteLiveStatus(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('live_status').delete().eq('user_id', userId).eq('session_id', sessionId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteLiveStatus' });
    return { success: false, error: 'Failed to delete live status' };
  }
}

export async function insertAttendance(supabase: SupabaseClient, data: AttendanceInsert): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_attendance').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertAttendance' });
    return { success: false, error: 'Failed to insert attendance' };
  }
}

export async function fetchMyLiveExpiry(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<string | null>> {
  try {
    const { data } = await supabase
      .from('live_status')
      .select('expires_at')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    return { success: true, data: data?.expires_at || null };
  } catch (error) {
    logError(error, { action: 'fetchMyLiveExpiry' });
    return { success: false, error: 'Failed' };
  }
}

export async function fetchLiveUsersWithDetails(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<LiveUserWithDetails[]>> {
  try {
    const { data } = await supabase
      .from('live_status')
      .select('user_id, started_at, user:users(name, avatar_url)')
      .eq('session_id', sessionId)
      .gt('expires_at', new Date().toISOString());
    return { success: true, data: (data || []) as unknown as LiveUserWithDetails[] };
  } catch (error) {
    logError(error, { action: 'fetchLiveUsersWithDetails' });
    return { success: false, error: 'Failed' };
  }
}

export async function pingLiveStatus(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('live_status')
      .update({ last_ping: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_id', sessionId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'pingLiveStatus' });
    return { success: false, error: 'Failed' };
  }
}

export async function renewLiveStatus(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  data: Record<string, string>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('live_status').update(data).eq('user_id', userId).eq('session_id', sessionId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'renewLiveStatus' });
    return { success: false, error: 'Failed' };
  }
}

export async function fetchAttendanceForSession(
  supabase: SupabaseClient,
  sessionId: string,
  userIds: string[]
): Promise<DalResult<Array<{ user_id: string; attended: boolean }>>> {
  try {
    const { data, error } = await supabase
      .from('session_attendance')
      .select('user_id, attended')
      .eq('session_id', sessionId)
      .in('user_id', userIds);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as Array<{ user_id: string; attended: boolean }> };
  } catch (error) {
    logError(error, { action: 'fetchAttendanceForSession' });
    return { success: false, error: 'Failed' };
  }
}

export async function upsertAttendance(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string,
  attended: boolean
): Promise<DalResult<null>> {
  try {
    const { data: existing } = await supabase
      .from('session_attendance')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('session_attendance')
        .update({ attended })
        .eq('session_id', sessionId)
        .eq('user_id', userId);
      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase
        .from('session_attendance')
        .insert({ session_id: sessionId, user_id: userId, attended });
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'upsertAttendance' });
    return { success: false, error: 'Failed' };
  }
}

export async function fetchSessionAttendance(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<Array<{ user_id: string; attended: boolean }>>> {
  try {
    const { data, error } = await supabase
      .from('session_attendance')
      .select('user_id, attended')
      .eq('session_id', sessionId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as Array<{ user_id: string; attended: boolean }> };
  } catch (error) {
    logError(error, { action: 'fetchSessionAttendance' });
    return { success: false, error: 'Failed' };
  }
}
