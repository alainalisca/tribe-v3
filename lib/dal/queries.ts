/**
 * DAL: additional query functions for migrating inline Supabase calls.
 * These complement the core DAL modules (sessions, participants, chat, etc.)
 * with queries that don't fit neatly into existing functions.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type {
  DalResult,
  StoryWithDetails,
  ChatMessageWithUser,
  PendingParticipantWithUser,
  JoinedSessionWithDetails,
} from './types';

/** Fetch multiple sessions by an array of IDs, with optional custom select fields. */
// REASON: dynamic field selection — callers specify which fields they need
export async function fetchSessionsByIds(
  supabase: SupabaseClient,
  ids: string[],
  fields?: string
): Promise<DalResult<Record<string, unknown>[]>> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(fields || '*')
      .in('id', ids);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as Record<string, unknown>[] };
  } catch (error) {
    logError(error, { action: 'fetchSessionsByIds' });
    return { success: false, error: 'Failed to fetch sessions by IDs' };
  }
}

/**
 * Batch-fetch chat messages (with user join) for multiple session IDs.
 * Returns messages ordered by created_at descending (newest first).
 */
export async function fetchChatMessagesForSessions(
  supabase: SupabaseClient,
  sessionIds: string[]
): Promise<DalResult<ChatMessageWithUser[]>> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`session_id, message, created_at, user:users!chat_messages_user_id_fkey(name)`)
      .in('session_id', sessionIds)
      .eq('deleted', false)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as ChatMessageWithUser[] };
  } catch (error) {
    logError(error, { action: 'fetchChatMessagesForSessions' });
    return { success: false, error: 'Failed to fetch chat messages' };
  }
}

/** Check whether a review by a given user already exists for a session. */
export async function fetchUserReviewExists(
  supabase: SupabaseClient,
  sessionId: string,
  reviewerId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('id')
      .eq('session_id', sessionId)
      .eq('reviewer_id', reviewerId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'fetchUserReviewExists' });
    return { success: false, error: 'Failed to check review' };
  }
}

/**
 * Fetch all recap photos (full row) for a session, ordered by uploaded_at ascending.
 * Unlike fetchRecapPhotosForSession (which selects limited fields), this returns all columns.
 */
export async function fetchAllRecapPhotosForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<Record<string, unknown>[]>> {
  try {
    const { data, error } = await supabase
      .from('session_recap_photos')
      .select('id, session_id, user_id, photo_url, uploaded_at, created_at, reported, reported_by, reported_reason')
      .eq('session_id', sessionId)
      .order('uploaded_at', { ascending: true })
      .limit(100);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchAllRecapPhotosForSession' });
    return { success: false, error: 'Failed to fetch recap photos' };
  }
}

/**
 * Fetch active (non-expired) stories for a session with user details.
 * Filters by expires_at > now and orders by created_at ascending.
 */
export async function fetchActiveStoriesForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<StoryWithDetails[]>> {
  try {
    const { data, error } = await supabase
      .from('session_stories')
      .select(
        'id, session_id, user_id, media_url, media_type, thumbnail_url, caption, created_at, user:users!session_stories_user_id_fkey(name, avatar_url)'
      )
      .eq('session_id', sessionId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as StoryWithDetails[] };
  } catch (error) {
    logError(error, { action: 'fetchActiveStoriesForSession' });
    return { success: false, error: 'Failed to fetch stories' };
  }
}

/**
 * Fetch all active (non-expired) stories globally, with user + session joins.
 * Used by the stories page and stories row component.
 */
export async function fetchAllActiveStories(supabase: SupabaseClient): Promise<DalResult<StoryWithDetails[]>> {
  try {
    const { data, error } = await supabase
      .from('session_stories')
      .select(
        `id, session_id, user_id, media_url, media_type, thumbnail_url, caption, created_at,
         user:users!session_stories_user_id_fkey(name, avatar_url),
         session:sessions!session_stories_session_id_fkey(sport)`
      )
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as StoryWithDetails[] };
  } catch (error) {
    logError(error, { action: 'fetchAllActiveStories' });
    return { success: false, error: 'Failed to fetch stories' };
  }
}

/**
 * Fetch participants for multiple sessions with user details.
 * Used by the matches page join-requests view.
 */
export async function fetchParticipantsForSessions(
  supabase: SupabaseClient,
  sessionIds: string[],
  status: string
): Promise<DalResult<PendingParticipantWithUser[]>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select(
        `id, user_id, session_id, joined_at, status,
         user:users!session_participants_user_id_fkey(id, name, avatar_url)`
      )
      .in('session_id', sessionIds)
      .eq('status', status)
      .order('joined_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as PendingParticipantWithUser[] };
  } catch (error) {
    logError(error, { action: 'fetchParticipantsForSessions' });
    return { success: false, error: 'Failed to fetch participants' };
  }
}

/**
 * Fetch confirmed participations with joined_at for a user.
 * Used by matches tribe-sessions view.
 */
export async function fetchConfirmedParticipations(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<Array<{ session_id: string; joined_at: string | null }>>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select('session_id, joined_at')
      .eq('user_id', userId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as Array<{ session_id: string; joined_at: string | null }> };
  } catch (error) {
    logError(error, { action: 'fetchConfirmedParticipations' });
    return { success: false, error: 'Failed to fetch participations' };
  }
}

/**
 * Fetch active sessions with participant join for a user (sessions created + joined).
 * Used by the stories row component's loadActiveSessions.
 */
export async function fetchJoinedSessionsWithDetails(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<JoinedSessionWithDetails[]>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select('session_id, sessions!inner(id, sport, date, start_time, location, status)')
      .eq('user_id', userId)
      .eq('sessions.status', 'active');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as JoinedSessionWithDetails[] };
  } catch (error) {
    logError(error, { action: 'fetchJoinedSessionsWithDetails' });
    return { success: false, error: 'Failed to fetch joined sessions' };
  }
}
