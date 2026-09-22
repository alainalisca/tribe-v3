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

/**
 * Should this athlete be asked for their sports right now?
 *
 * DEFER, NOT SKIP. An athlete arriving through a share link goes to the
 * session first -- the invite wins, and sending someone who tapped an invite
 * to a form instead of the session is how you lose them. The ask happens
 * immediately after they join, with returnTo pointing back at the session.
 *
 * THE SPORTS CHECK IS LOAD-BEARING, NOT BELT-AND-BRACES.
 * athlete_setup_completed_at was added by migration 187 and is therefore NULL
 * for every account that existed before today, including the 22 athletes whose
 * profiles are already complete. Gating on that column alone would interrupt
 * all of them after their next join to ask for sports they already chose.
 *
 * That is onboarding_completed_at's backfill problem inverted: there, a column
 * was non-NULL for everyone and read as "done"; here, a new column is NULL for
 * everyone and would read as "not done". A new timestamp column means NOT
 * RECORDED. It does not mean not done, and the difference is the whole
 * population until the column has been live long enough to have been written.
 *
 * A failed read returns false. Interrupting a join because a profile query
 * errored is worse than missing one ask -- the home-feed banner catches them
 * either way. The error is logged rather than collapsed into the same `false`
 * a complete profile produces.
 */
export async function needsAthleteSetup(supabase: SupabaseClient, userId: string): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('users')
      // Name only granted columns: public.users is under column-level SELECT
      // grants and PostgREST fails the WHOLE request on an ungranted one.
      .select('athlete_setup_completed_at, sports, is_instructor')
      .eq('id', userId)
      .maybeSingle();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: true, data: false };

    const row = data as {
      athlete_setup_completed_at: string | null;
      sports: string[] | null;
      is_instructor: boolean | null;
    };
    // is_instructor IS NOT TRUE: NULL counts as an athlete, matching the SQL
    // side (migration 181) rather than a JS truthiness check that would too.
    const isAthlete = row.is_instructor !== true;
    const noSports = (row.sports?.length ?? 0) === 0;
    return { success: true, data: isAthlete && row.athlete_setup_completed_at === null && noSports };
  } catch (error) {
    logError(error, { action: 'needsAthleteSetup', userId });
    return { success: false, error: 'Failed to read athlete setup state' };
  }
}
