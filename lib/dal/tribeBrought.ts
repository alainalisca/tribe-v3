/**
 * DAL: "Lo que Tribe te trajo este mes" (T-AV31, P1-4).
 *
 * One read-only definer function (migration 8003) computes everything for the
 * signed-in instructor; definitions of contacts, confirmed first visits and
 * came-back are in that migration's header.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface BroughtGroup {
  count: number;
  /** First names, ordered by when it happened. */
  names: string[];
}

export interface TribeBrought {
  month: string; // YYYY-MM
  contacts: BroughtGroup;
  firstVisits: BroughtGroup;
  cameBack: BroughtGroup;
}

function group(raw: unknown): BroughtGroup | null {
  const g = raw as { count?: unknown; names?: unknown } | null;
  if (!g || typeof g.count !== 'number' || !Array.isArray(g.names)) return null;
  return { count: g.count, names: g.names.filter((n): n is string => typeof n === 'string' && n !== '') };
}

export async function fetchTribeBrought(supabase: SupabaseClient): Promise<DalResult<TribeBrought>> {
  try {
    const { data, error } = await supabase.rpc('av_coach_tribe_brought', {});
    if (error) {
      logError(error, { action: 'fetchTribeBrought' });
      return { success: false, error: error.message };
    }
    const body = (data ?? {}) as Record<string, unknown>;
    if (body.success !== true) return { success: false, error: String(body.error ?? 'unknown') };
    const contacts = group(body.contacts);
    const firstVisits = group(body.first_visits);
    const cameBack = group(body.came_back);
    if (!contacts || !firstVisits || !cameBack || typeof body.month !== 'string') {
      logError(new Error('av_coach_tribe_brought returned an unexpected shape'), { action: 'fetchTribeBrought' });
      return { success: false, error: 'bad_shape' };
    }
    return { success: true, data: { month: body.month, contacts, firstVisits, cameBack } };
  } catch (error) {
    logError(error, { action: 'fetchTribeBrought' });
    return { success: false, error: 'Failed' };
  }
}
