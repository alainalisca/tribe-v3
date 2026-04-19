/** DAL: training_interest table — warm lead signals from athletes to instructors. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type TrainingInterestStatus = 'active' | 'contacted' | 'booked' | 'dismissed';

export interface TrainingInterestWithAthlete {
  id: string;
  athlete: {
    id: string;
    name: string;
    avatar_url: string | null;
    preferred_sports: string[];
    location: string | null;
  } | null;
  sport: string | null;
  message: string | null;
  status: TrainingInterestStatus;
  created_at: string;
}

/** Athlete expresses interest in training with an instructor. */
export async function expressInterest(
  supabase: SupabaseClient,
  athleteId: string,
  instructorId: string,
  sport?: string,
  message?: string
): Promise<DalResult<{ id: string }>> {
  try {
    // upsert so a repeat tap reactivates a previously-dismissed row
    const { data, error } = await supabase
      .from('training_interest')
      .upsert(
        {
          athlete_id: athleteId,
          instructor_id: instructorId,
          sport: sport ?? null,
          message: message ?? null,
          status: 'active',
        },
        { onConflict: 'athlete_id,instructor_id' }
      )
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'expressInterest', athleteId, instructorId });
    return { success: false, error: 'Failed to express interest' };
  }
}

/** Remove an interest signal entirely. */
export async function withdrawInterest(
  supabase: SupabaseClient,
  athleteId: string,
  instructorId: string
): Promise<DalResult<void>> {
  try {
    const { error } = await supabase
      .from('training_interest')
      .delete()
      .eq('athlete_id', athleteId)
      .eq('instructor_id', instructorId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'withdrawInterest', athleteId, instructorId });
    return { success: false, error: 'Failed to withdraw interest' };
  }
}

/** Whether a given athlete has an active interest signal for an instructor. */
export async function hasExpressedInterest(
  supabase: SupabaseClient,
  athleteId: string,
  instructorId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('training_interest')
      .select('id, status')
      .eq('athlete_id', athleteId)
      .eq('instructor_id', instructorId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    const row = data as { id: string; status: TrainingInterestStatus } | null;
    return { success: true, data: !!row && row.status !== 'dismissed' };
  } catch (error) {
    logError(error, { action: 'hasExpressedInterest', athleteId, instructorId });
    return { success: false, error: 'Failed to check interest' };
  }
}

/** List interest signals for an instructor, with optional status filter. */
export async function fetchInterestForInstructor(
  supabase: SupabaseClient,
  instructorId: string,
  status?: TrainingInterestStatus,
  limit: number = 50,
  offset: number = 0
): Promise<DalResult<{ interests: TrainingInterestWithAthlete[]; total: number }>> {
  try {
    let countQuery = supabase
      .from('training_interest')
      .select('id', { count: 'exact', head: true })
      .eq('instructor_id', instructorId);
    if (status) countQuery = countQuery.eq('status', status);
    const { count, error: countError } = await countQuery;
    if (countError) return { success: false, error: countError.message };

    let query = supabase
      .from('training_interest')
      .select(
        `
        id,
        sport,
        message,
        status,
        created_at,
        athlete:athlete_id(id, name, avatar_url, preferred_sports, location)
      `
      )
      .eq('instructor_id', instructorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const interests: TrainingInterestWithAthlete[] = (data || []).map((row: Record<string, unknown>) => {
      const athleteRel = row.athlete as {
        id: string;
        name: string;
        avatar_url: string | null;
        preferred_sports: string[] | null;
        location: string | null;
      } | null;
      return {
        id: row.id as string,
        sport: (row.sport as string | null) ?? null,
        message: (row.message as string | null) ?? null,
        status: row.status as TrainingInterestStatus,
        created_at: row.created_at as string,
        athlete: athleteRel
          ? {
              id: athleteRel.id,
              name: athleteRel.name,
              avatar_url: athleteRel.avatar_url,
              preferred_sports: athleteRel.preferred_sports || [],
              location: athleteRel.location,
            }
          : null,
      };
    });

    return { success: true, data: { interests, total: count ?? 0 } };
  } catch (error) {
    logError(error, { action: 'fetchInterestForInstructor', instructorId });
    return { success: false, error: 'Failed to fetch interest signals' };
  }
}

/** Update the status on one interest row; instructor must own it (enforced by RLS). */
export async function updateInterestStatus(
  supabase: SupabaseClient,
  interestId: string,
  instructorId: string,
  status: Exclude<TrainingInterestStatus, 'active'>
): Promise<DalResult<void>> {
  try {
    const { error } = await supabase
      .from('training_interest')
      .update({ status })
      .eq('id', interestId)
      .eq('instructor_id', instructorId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateInterestStatus', interestId, instructorId });
    return { success: false, error: 'Failed to update interest status' };
  }
}
