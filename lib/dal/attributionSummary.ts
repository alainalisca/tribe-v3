/**
 * DAL: the admin Origen read (T-GROW1 part F). SERVICE-ROLE ONLY.
 *
 * WHY SERVICE ROLE, and it is the same answer lib/dal/adminLeads.ts gives for a
 * different reason. There, the blocker was public.users.email, which no client
 * role may select. Here it is narrower and harder: migration 213 grants
 * `admin_attribution_summary` to service_role ALONE and revokes it from anon and
 * authenticated, so an admin's browser client cannot call it at all. That is
 * deliberate -- the function returns every lead and attendance count in the app,
 * and an EXECUTE grant to `authenticated` would make those readable by anybody
 * with an account.
 *
 * So this runs where /api/admin/data already runs, behind requireApiAdmin(),
 * which is the same is_app_admin() gate the panel itself uses and which fails
 * closed before any data is read.
 *
 * WHY A FUNCTION AND NOT A QUERY. PostgREST on this project has AGGREGATES
 * DISABLED -- select=count() returns PGRST123, the constraint adminLeads.ts and
 * fetchGymsAndStudios both document -- so a GROUP BY cannot happen over the wire.
 * The grouping across the four dimensions happens in SQL once; the tab's "group
 * by" toggle collapses the result in lib/growth/originGrouping.ts, which is pure
 * and tested.
 *
 * THE PARTNER DASHBOARD DOES NOT COME THROUGH HERE, and must not: this returns
 * every partner's numbers in one table. Per-partner source analytics is the
 * Tribe.OS premium candidate named in the programme spec, and it needs a
 * partner-scoped function rather than a filter on this one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { OriginRow } from '@/lib/growth/originGrouping';

/**
 * Every (src, code, utm_campaign, attr_ref) tuple with a visit or a lead in the
 * window, with its four counts.
 *
 * @param since ISO instant, or null for all time (the function's p_since IS NULL
 *              branch). Built by originRangeSince, never by this module, so the
 *              window is computed in one place and is pure.
 */
export async function fetchAttributionSummary(
  supabase: SupabaseClient,
  since: string | null
): Promise<DalResult<OriginRow[]>> {
  try {
    const { data, error } = await supabase.rpc('admin_attribution_summary', { p_since: since });

    if (error) {
      logError(error, { action: 'fetchAttributionSummary', since });
      return { success: false, error: error.message };
    }

    /**
     * COERCED, not cast.
     *
     * PostgREST returns Postgres `bigint` as a JSON NUMBER here (count() over a
     * table this size cannot exceed 2^53), but the client types it as `unknown`
     * and some drivers hand back a string. Number() on each count makes the
     * arithmetic in originGrouping.ts addition rather than string concatenation --
     * which would not throw, would not fail a type check, and would render
     * "1020" where 30 was meant.
     *
     * CLAUDE.md's rule on casts applies directly: `as OriginRow[]` would turn off
     * the one check that could notice, and a fixture-shaped lie here produces a
     * wrong number rather than a crash.
     */
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      success: true,
      data: rows.map((r) => ({
        src: typeof r.src === 'string' ? r.src : null,
        code: typeof r.code === 'string' ? r.code : null,
        utm_campaign: typeof r.utm_campaign === 'string' ? r.utm_campaign : null,
        attr_ref: typeof r.attr_ref === 'string' ? r.attr_ref : null,
        visits: Number(r.visits ?? 0),
        leads: Number(r.leads ?? 0),
        contacted: Number(r.contacted ?? 0),
        attended: Number(r.attended ?? 0),
      })),
    };
  } catch (error) {
    logError(error, { action: 'fetchAttributionSummary', since });
    return { success: false, error: 'Failed to fetch the attribution summary' };
  }
}
