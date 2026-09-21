import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * Sport-level demand, from migration 186's sport_demand_counts RPC.
 *
 * `athletes` is a BAND ("30+"), never an exact count. Migration 186 returns
 * text for exactly this reason -- an exact number supports arithmetic a band
 * does not, and watching 31 become 32 tells an instructor that one specific
 * person joined.
 *
 * Sports with fewer than 5 athletes are OMITTED by the RPC, not returned as
 * zero. The distinction matters to the caller: an absent sport is not a sport
 * nobody does, which is why the UI states the rule.
 *
 * INSTRUCTORS ONLY. The RPC raises 42501 for an athlete or an anonymous
 * caller, so a non-instructor calling this gets an error rather than an empty
 * list -- a deliberate difference, since silence would read as "no demand".
 */
export interface SportDemand {
  sport: string;
  /** A band such as "5+", "10+", "30+". Never an exact count. */
  athletes: string;
}

export async function fetchSportDemand(supabase: SupabaseClient): Promise<DalResult<SportDemand[]>> {
  try {
    const { data, error } = await supabase.rpc('sport_demand_counts');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as SportDemand[] };
  } catch (error) {
    logError(error, { action: 'fetchSportDemand' });
    return { success: false, error: 'Failed to fetch demand' };
  }
}
