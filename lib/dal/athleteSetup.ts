import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * Finish the one-screen athlete setup: choose at least one sport.
 *
 * THE REQUIREMENT LIVES IN THE DATABASE, NOT HERE. complete_athlete_setup
 * (migration 187) raises 23514 on an empty or whitespace-only list. This
 * wrapper does not pre-validate, deliberately -- a check here would be a
 * second copy of the rule, and the one that gets bypassed the moment another
 * caller appears. The UI also disables its button, which is a courtesy, not
 * the enforcement.
 *
 * It does NOT touch onboarding_completed_at. That column is the first-run
 * intro tour, backfilled for every pre-156 account, and giving it a second
 * meaning is what made an earlier query conclude 27 athletes had finished a
 * wizard that does not exist.
 */
export async function completeAthleteSetup(supabase: SupabaseClient, sports: string[]): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.rpc('complete_athlete_setup', { p_sports: sports });
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'completeAthleteSetup' });
    return { success: false, error: 'Failed to save your sports' };
  }
}
