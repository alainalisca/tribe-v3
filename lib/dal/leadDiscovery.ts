/** DAL: premium instructor → athlete lead discovery. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type SeekingBudget = 'free_only' | 'budget' | 'moderate' | 'premium' | 'any';
export type SeekingSchedule = 'mornings' | 'afternoons' | 'evenings' | 'weekends' | 'flexible';
export type LeadTier = 'free' | 'growth' | 'unlimited';

export interface SeekingAthlete {
  id: string;
  name: string;
  avatar_url: string | null;
  seeking_trainer_sports: string[];
  seeking_trainer_budget: SeekingBudget | null;
  seeking_trainer_schedule: SeekingSchedule | null;
  seeking_trainer_note: string | null;
  location: string | null;
}

export interface SeekingPreferences {
  seeking_trainer: boolean;
  seeking_trainer_sports: string[];
  seeking_trainer_budget: SeekingBudget | null;
  seeking_trainer_schedule: SeekingSchedule | null;
  seeking_trainer_note: string | null;
}

/** Update an athlete's "looking for a trainer" preferences. */
export async function updateSeekingPreferences(
  supabase: SupabaseClient,
  userId: string,
  prefs: Partial<SeekingPreferences>
): Promise<DalResult<void>> {
  try {
    const { error } = await supabase.from('users').update(prefs).eq('id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateSeekingPreferences', userId });
    return { success: false, error: 'Failed to update preferences' };
  }
}

/** List athletes currently opted-in as seeking a trainer, with filters. */
export async function fetchSeekingAthletes(
  supabase: SupabaseClient,
  filters: {
    sport?: string;
    budget?: SeekingBudget;
    schedule?: SeekingSchedule;
    location?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<DalResult<SeekingAthlete[]>> {
  try {
    const { sport, budget, schedule, location, limit = 20, offset = 0 } = filters;
    let query = supabase
      .from('users')
      .select(
        'id, name, avatar_url, seeking_trainer_sports, seeking_trainer_budget, seeking_trainer_schedule, seeking_trainer_note, location'
      )
      .eq('seeking_trainer', true)
      .range(offset, offset + limit - 1);

    if (sport) query = query.contains('seeking_trainer_sports', [sport]);
    if (budget) query = query.eq('seeking_trainer_budget', budget);
    if (schedule) query = query.eq('seeking_trainer_schedule', schedule);
    if (location) query = query.eq('location', location);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data || []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        name: (row.name as string) || '',
        avatar_url: (row.avatar_url as string | null) ?? null,
        seeking_trainer_sports: (row.seeking_trainer_sports as string[] | null) || [],
        seeking_trainer_budget: (row.seeking_trainer_budget as SeekingBudget | null) ?? null,
        seeking_trainer_schedule: (row.seeking_trainer_schedule as SeekingSchedule | null) ?? null,
        seeking_trainer_note: (row.seeking_trainer_note as string | null) ?? null,
        location: (row.location as string | null) ?? null,
      })),
    };
  } catch (error) {
    logError(error, { action: 'fetchSeekingAthletes' });
    return { success: false, error: 'Failed to fetch athletes' };
  }
}

/**
 * Record an instructor "reaching out" to an athlete and decrement credits.
 * Returns the new credit balance. Throws business errors via DalResult.
 */
export async function reachOutToAthlete(
  supabase: SupabaseClient,
  instructorId: string,
  athleteId: string
): Promise<DalResult<{ creditsRemaining: number }>> {
  try {
    const { data: instructor, error: instErr } = await supabase
      .from('users')
      .select('lead_credits_remaining, lead_tier, is_verified_instructor')
      .eq('id', instructorId)
      .single();
    if (instErr) return { success: false, error: instErr.message };
    const inst = instructor as {
      lead_credits_remaining: number | null;
      lead_tier: LeadTier | null;
      is_verified_instructor: boolean | null;
    };
    if (!inst.is_verified_instructor) {
      return { success: false, error: 'Only verified instructors can reach out' };
    }
    const remaining = inst.lead_credits_remaining ?? 0;
    if (remaining <= 0 && inst.lead_tier !== 'unlimited') {
      return { success: false, error: 'No credits remaining this month' };
    }

    const { error: insErr } = await supabase
      .from('lead_reaches')
      .insert({ instructor_id: instructorId, athlete_id: athleteId });
    if (insErr) {
      if (insErr.message.toLowerCase().includes('duplicate')) {
        return { success: false, error: 'You already reached this athlete' };
      }
      return { success: false, error: insErr.message };
    }

    // Unlimited tier doesn't get decremented.
    if (inst.lead_tier === 'unlimited') {
      return { success: true, data: { creditsRemaining: 9999 } };
    }
    const newRemaining = Math.max(0, remaining - 1);
    const { error: updErr } = await supabase
      .from('users')
      .update({ lead_credits_remaining: newRemaining })
      .eq('id', instructorId);
    if (updErr) return { success: false, error: updErr.message };

    return { success: true, data: { creditsRemaining: newRemaining } };
  } catch (error) {
    logError(error, { action: 'reachOutToAthlete', instructorId, athleteId });
    return { success: false, error: 'Failed to reach out' };
  }
}

/** Monthly reset of lead credits based on lead_tier. */
export async function resetMonthlyLeadCredits(supabase: SupabaseClient): Promise<DalResult<{ reset: number }>> {
  try {
    const tiers: Array<{ tier: LeadTier; credits: number }> = [
      { tier: 'free', credits: 3 },
      { tier: 'growth', credits: 15 },
      { tier: 'unlimited', credits: 9999 },
    ];
    let total = 0;
    const now = new Date().toISOString();
    for (const t of tiers) {
      const { data, error } = await supabase
        .from('users')
        .update({ lead_credits_remaining: t.credits, lead_credits_reset_at: now })
        .eq('lead_tier', t.tier)
        .eq('is_instructor', true)
        .select('id');
      if (error) return { success: false, error: error.message };
      total += (data || []).length;
    }
    return { success: true, data: { reset: total } };
  } catch (error) {
    logError(error, { action: 'resetMonthlyLeadCredits' });
    return { success: false, error: 'Failed to reset credits' };
  }
}
