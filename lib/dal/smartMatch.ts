/** DAL: smart match — training preferences and auto-match results */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { UserTrainingPreferences, UserTrainingPreferencesUpdate, SmartMatchRow } from '@/lib/database.types';

/** Availability slot shape stored as JSONB */
export interface AvailabilitySlot {
  day: string;
  start: string;
  end: string;
}

/** Smart match with joined matched-user details */
export interface SmartMatchWithUser extends SmartMatchRow {
  matched_user: { name: string; avatar_url: string | null; sports: string[] } | null;
}

/**
 * Upsert training preferences for a user. Creates on first call, updates thereafter.
 */
export async function upsertTrainingPreferences(
  supabase: SupabaseClient,
  userId: string,
  prefs: {
    preferred_sports?: string[];
    availability?: AvailabilitySlot[];
    gender_preference?: string;
    max_distance_km?: number;
    active?: boolean;
  }
): Promise<DalResult<UserTrainingPreferences>> {
  try {
    const payload = {
      user_id: userId,
      ...prefs,
      availability: prefs.availability ? JSON.parse(JSON.stringify(prefs.availability)) : undefined,
      updated_at: new Date().toISOString(),
    } as UserTrainingPreferencesUpdate & { user_id: string };

    const { data, error } = await supabase
      .from('user_training_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'upsertTrainingPreferences', userId });
    return { success: false, error: 'Failed to save training preferences' };
  }
}

/**
 * Fetch training preferences for a user. Returns null data if none exist.
 */
export async function fetchTrainingPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<UserTrainingPreferences | null>> {
  try {
    const { data, error } = await supabase
      .from('user_training_preferences')
      .select('id, user_id, preferred_sports, availability, gender_preference, max_distance_km, active, created_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? null };
  } catch (error) {
    logError(error, { action: 'fetchTrainingPreferences', userId });
    return { success: false, error: 'Failed to fetch training preferences' };
  }
}

/**
 * Fetch smart matches for a user with matched-user profile info.
 * Only returns pending/notified matches by default (not dismissed).
 */
export async function fetchSmartMatches(
  supabase: SupabaseClient,
  userId: string,
  limit = 10
): Promise<DalResult<SmartMatchWithUser[]>> {
  try {
    const { data, error } = await supabase
      .from('smart_matches')
      .select('*, matched_user:users!smart_matches_matched_user_id_fkey(name, avatar_url, sports)')
      .eq('user_id', userId)
      .in('status', ['pending', 'notified'])
      .order('score', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as SmartMatchWithUser[] };
  } catch (error) {
    logError(error, { action: 'fetchSmartMatches', userId });
    return { success: false, error: 'Failed to fetch smart matches' };
  }
}

/**
 * Update the status of a smart match (e.g. dismiss or mark as acted).
 */
export async function updateMatchStatus(
  supabase: SupabaseClient,
  matchId: string,
  status: 'pending' | 'notified' | 'dismissed' | 'acted'
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('smart_matches').update({ status }).eq('id', matchId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updateMatchStatus', matchId });
    return { success: false, error: 'Failed to update match status' };
  }
}
