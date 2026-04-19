/** DAL: challenges and challenge_participants tables */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type ChallengeType = 'session_count' | 'streak' | 'sport_variety' | 'custom';

/** Challenge row with creator info */
export interface ChallengeWithCreator {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  challenge_type: ChallengeType;
  target_value: number;
  start_date: string;
  end_date: string;
  creator_id: string;
  community_id: string | null;
  sport: string | null;
  is_public: boolean;
  participant_count: number;
  created_at: string;
  creator?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

/** Challenge participant with progress */
export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  user_id: string;
  progress: number;
  joined_at: string;
  completed_at: string | null;
  user?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

/** Fetch public challenges (not expired), optionally filtered by sport or search */
export async function fetchPublicChallenges(
  supabase: SupabaseClient,
  options: {
    sport?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<DalResult<ChallengeWithCreator[]>> {
  try {
    const { sport, search, limit = 20, offset = 0 } = options;
    const now = new Date().toISOString();

    let query = supabase
      .from('challenges')
      .select(
        `
        id,
        title,
        description,
        cover_image_url,
        challenge_type,
        target_value,
        start_date,
        end_date,
        creator_id,
        community_id,
        sport,
        is_public,
        participant_count,
        created_at,
        creator:users(id, name, avatar_url)
      `
      )
      .eq('is_public', true)
      .gte('end_date', now) // Not expired
      .order('participant_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sport) {
      query = query.eq('sport', sport);
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    // Map Supabase join arrays to single objects
    const challenges: ChallengeWithCreator[] = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      creator: Array.isArray(c.creator) ? c.creator[0] : c.creator,
    })) as ChallengeWithCreator[];

    return { success: true, data: challenges };
  } catch (error) {
    logError(error, { action: 'fetchPublicChallenges' });
    return { success: false, error: 'Failed to fetch challenges' };
  }
}

/** Fetch challenges the user has joined with their progress */
export async function fetchUserChallenges(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<(ChallengeWithCreator & { userProgress?: number })[]>> {
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select(
        `
        progress,
        challenges(
          id,
          title,
          description,
          cover_image_url,
          challenge_type,
          target_value,
          start_date,
          end_date,
          creator_id,
          community_id,
          sport,
          is_public,
          participant_count,
          created_at,
          creator:users(id, name, avatar_url)
        )
      `
      )
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    const challenges: (ChallengeWithCreator & { userProgress?: number })[] = (data || []).map(
      (item: Record<string, unknown>) => {
        const challenge = Array.isArray(item.challenges) ? item.challenges[0] : item.challenges;
        return {
          ...(challenge as ChallengeWithCreator),
          userProgress: item.progress as number,
          creator: Array.isArray(challenge.creator) ? challenge.creator[0] : challenge.creator,
        };
      }
    );

    return { success: true, data: challenges };
  } catch (error) {
    logError(error, { action: 'fetchUserChallenges', userId });
    return { success: false, error: 'Failed to fetch user challenges' };
  }
}

/** Fetch a single challenge by ID with creator info */
export async function fetchChallengeById(
  supabase: SupabaseClient,
  challengeId: string
): Promise<DalResult<ChallengeWithCreator>> {
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select(
        `
        id,
        title,
        description,
        cover_image_url,
        challenge_type,
        target_value,
        start_date,
        end_date,
        creator_id,
        community_id,
        sport,
        is_public,
        participant_count,
        created_at,
        creator:users(id, name, avatar_url)
      `
      )
      .eq('id', challengeId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const challenge: ChallengeWithCreator = {
      ...data,
      creator: Array.isArray(data.creator) ? data.creator[0] : data.creator,
    } as ChallengeWithCreator;

    return { success: true, data: challenge };
  } catch (error) {
    logError(error, { action: 'fetchChallengeById', challengeId });
    return { success: false, error: 'Failed to fetch challenge' };
  }
}

/** Create a new challenge */
export async function createChallenge(
  supabase: SupabaseClient,
  data: {
    title: string;
    description?: string;
    cover_image_url?: string;
    challenge_type: ChallengeType;
    target_value: number;
    start_date: string;
    end_date: string;
    creator_id: string;
    community_id?: string;
    sport?: string;
    is_public: boolean;
  }
): Promise<DalResult<{ id: string }>> {
  try {
    const { data: newChallenge, error } = await supabase.from('challenges').insert(data).select('id').single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: { id: newChallenge.id } };
  } catch (error) {
    logError(error, { action: 'createChallenge' });
    return { success: false, error: 'Failed to create challenge' };
  }
}

/** User joins a challenge */
export async function joinChallenge(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    // Insert participant
    const { error: insertError } = await supabase.from('challenge_participants').insert({
      challenge_id: challengeId,
      user_id: userId,
      progress: 0,
    });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // Increment participant_count on challenge
    const { data: challenge } = await supabase
      .from('challenges')
      .select('participant_count')
      .eq('id', challengeId)
      .single();

    if (challenge) {
      await supabase
        .from('challenges')
        .update({ participant_count: (challenge.participant_count || 0) + 1 })
        .eq('id', challengeId);
    }

    return { success: true };
  } catch (error) {
    logError(error, { action: 'joinChallenge', challengeId, userId });
    return { success: false, error: 'Failed to join challenge' };
  }
}

/** User leaves a challenge */
export async function leaveChallenge(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    // Delete participant
    const { error: deleteError } = await supabase
      .from('challenge_participants')
      .delete()
      .eq('challenge_id', challengeId)
      .eq('user_id', userId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    // Decrement participant_count on challenge
    const { data: challenge } = await supabase
      .from('challenges')
      .select('participant_count')
      .eq('id', challengeId)
      .single();

    if (challenge) {
      const newCount = Math.max(0, (challenge.participant_count || 0) - 1);
      await supabase.from('challenges').update({ participant_count: newCount }).eq('id', challengeId);
    }

    return { success: true };
  } catch (error) {
    logError(error, { action: 'leaveChallenge', challengeId, userId });
    return { success: false, error: 'Failed to leave challenge' };
  }
}

/** Fetch challenge leaderboard (participants ranked by progress) */
export async function fetchChallengeLeaderboard(
  supabase: SupabaseClient,
  challengeId: string,
  limit: number = 10
): Promise<DalResult<ChallengeParticipant[]>> {
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select(
        `
        id,
        challenge_id,
        user_id,
        progress,
        joined_at,
        completed_at,
        user:users(id, name, avatar_url)
      `
      )
      .eq('challenge_id', challengeId)
      .order('progress', { ascending: false })
      .limit(limit);

    if (error) {
      return { success: false, error: error.message };
    }

    const participants: ChallengeParticipant[] = (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      user: Array.isArray(p.user) ? p.user[0] : p.user,
    })) as ChallengeParticipant[];

    return { success: true, data: participants };
  } catch (error) {
    logError(error, { action: 'fetchChallengeLeaderboard', challengeId });
    return { success: false, error: 'Failed to fetch leaderboard' };
  }
}

/** Check if user is in a challenge */
export async function isInChallenge(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('id')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is expected
      return { success: false, error: error.message };
    }

    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'isInChallenge', challengeId, userId });
    return { success: false, error: 'Failed to check challenge membership' };
  }
}

/** Get user's progress in a challenge */
export async function getUserChallengeProgress(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<DalResult<ChallengeParticipant | null>> {
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('id, challenge_id, user_id, progress, joined_at, completed_at')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || null };
  } catch (error) {
    logError(error, { action: 'getUserChallengeProgress', challengeId, userId });
    return { success: false, error: 'Failed to fetch progress' };
  }
}

/**
 * Recalculate challenge progress from actual session participation data.
 * Prevents cheating by deriving progress from confirmed session records.
 */
export async function recalculateChallengeProgress(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<DalResult<number>> {
  try {
    const { data: challenge } = await supabase
      .from('challenges')
      .select('challenge_type, target_value, sport, start_date, end_date')
      .eq('id', challengeId)
      .single();

    if (!challenge) return { success: false, error: 'Challenge not found' };

    let progress = 0;

    if (challenge.challenge_type === 'session_count') {
      const { count } = await supabase
        .from('session_participants')
        .select('*, sessions!inner(date, sport)', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .gte('sessions.date', challenge.start_date)
        .lte('sessions.date', challenge.end_date);
      progress = count || 0;
    } else if (challenge.challenge_type === 'sport_variety') {
      const { data: sessions } = await supabase
        .from('session_participants')
        .select('sessions!inner(sport)')
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .gte('sessions.date', challenge.start_date)
        .lte('sessions.date', challenge.end_date);
      const uniqueSports = new Set(
        sessions?.map((s: Record<string, unknown>) => (s.sessions as Record<string, unknown>)?.sport).filter(Boolean)
      );
      progress = uniqueSports.size;
    }

    await supabase
      .from('challenge_participants')
      .update({ progress, updated_at: new Date().toISOString() })
      .eq('challenge_id', challengeId)
      .eq('user_id', userId);

    return { success: true, data: progress };
  } catch (error) {
    logError(error, { action: 'recalculateChallengeProgress', challengeId, userId });
    return { success: false, error: 'Failed to recalculate progress' };
  }
}
