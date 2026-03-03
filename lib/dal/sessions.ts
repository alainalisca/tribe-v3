// Data Access Layer for sessions
// Migration in progress — new code should use these functions
// Existing inline queries will be migrated incrementally

import { SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '@/lib/database.types';
import { logError } from '@/lib/logger';

// --- Result types ---

interface DalResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// --- Query return types (with joined relations) ---

export interface SessionParticipantWithUser {
  user_id: string | null;
  status: string | null;
  is_guest?: boolean | null;
  guest_name?: string | null;
  user: { id: string; name: string; avatar_url: string | null } | null;
}

export interface SessionWithRelations extends Session {
  participants: SessionParticipantWithUser[];
  creator: {
    id: string;
    name: string;
    avatar_url: string | null;
    average_rating: number | null;
    total_reviews: number | null;
  } | null;
}

// --- Read operations ---

/**
 * Fetches a single session by ID with all columns.
 */
export async function fetchSession(supabase: SupabaseClient, sessionId: string): Promise<DalResult<Session>> {
  try {
    const { data, error } = await supabase.from('sessions').select('*').eq('id', sessionId).single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchSession', sessionId });
    return { success: false, error: 'Failed to fetch session' };
  }
}

/**
 * Fetches a session with creator info and confirmed participants (with user details).
 * Used by the session detail page.
 */
export async function fetchSessionWithDetails(
  supabase: SupabaseClient,
  sessionId: string
): Promise<
  DalResult<{
    session: Session;
    creator: SessionWithRelations['creator'];
    participants: SessionWithRelations['participants'];
  }>
> {
  try {
    const { data: session, error } = await supabase.from('sessions').select('*').eq('id', sessionId).single();

    if (error) return { success: false, error: error.message };

    const { data: creator } = await supabase
      .from('users')
      .select('id, name, avatar_url, average_rating, total_reviews')
      .eq('id', session.creator_id)
      .single();

    const { data: participants } = await supabase
      .from('session_participants')
      .select('user_id, status, is_guest, guest_name, user:users(id, name, avatar_url)')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    return {
      success: true,
      data: {
        session,
        creator: creator || null,
        participants: (participants || []) as unknown as SessionParticipantWithUser[],
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchSessionWithDetails', sessionId });
    return { success: false, error: 'Failed to fetch session details' };
  }
}

/**
 * Fetches upcoming active sessions with participants and creator info.
 * Used by the home page feed.
 */
export async function fetchUpcomingSessions(supabase: SupabaseClient): Promise<DalResult<SessionWithRelations[]>> {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('sessions')
      .select(
        `
        *,
        participants:session_participants(
          user_id,
          status,
          user:users(id, name, avatar_url)
        ),
        creator:users!sessions_creator_id_fkey(id, name, avatar_url, average_rating, total_reviews)
      `
      )
      .eq('status', 'active')
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as SessionWithRelations[] };
  } catch (error) {
    logError(error, { action: 'fetchUpcomingSessions' });
    return { success: false, error: 'Failed to fetch sessions' };
  }
}

/**
 * Fetches the confirmed participant count for a session.
 * Used for capacity checks.
 */
export async function fetchConfirmedCount(supabase: SupabaseClient, sessionId: string): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchConfirmedCount', sessionId });
    return { success: false, error: 'Failed to fetch participant count' };
  }
}

// --- Write operations ---

/**
 * Cancels (soft-deletes) a session by setting status to 'cancelled'.
 */
export async function cancelSession(supabase: SupabaseClient, sessionId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('sessions').update({ status: 'cancelled' }).eq('id', sessionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'cancelSession', sessionId });
    return { success: false, error: 'Failed to cancel session' };
  }
}

/**
 * Permanently deletes a session.
 */
export async function deleteSession(supabase: SupabaseClient, sessionId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteSession', sessionId });
    return { success: false, error: 'Failed to delete session' };
  }
}

/**
 * Updates the participant count for a session.
 */
export async function updateParticipantCount(
  supabase: SupabaseClient,
  sessionId: string,
  count: number
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('sessions')
      .update({ current_participants: Math.max(0, count) })
      .eq('id', sessionId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateParticipantCount', sessionId });
    return { success: false, error: 'Failed to update participant count' };
  }
}
