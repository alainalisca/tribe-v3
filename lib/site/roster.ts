import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { logError } from '@/lib/logger';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { bogotaToday } from '@/lib/time/bogotaDate';
import { addDays } from './rosterDates';
import { buildRoster, ROSTER_WINDOW_DAYS, type RosterCoach, type RosterSessionRow } from './rosterBuild';

/**
 * T-SITE1.1 Part C. The live coach roster, read on the server.
 *
 * SERVICE ROLE, SERVER ONLY, like the week board (lib/site/week.ts): the anon
 * key cannot read `sessions`. The select names only what the roster needs, so a
 * private column cannot ride along, and the client gets RosterCoach, whose every
 * field is public. users.location is not selected (Al, 2026-10-17).
 *
 * One query, cached five minutes per Bogotá day, shared by Inicio and Coaches
 * in a render through React's cache(). Never throws: a failure renders the
 * roster's empty state.
 */
const SELECT =
  'sport, date, status, partner_status, partner:featured_partners(business_name, status), ' +
  'creator:users!sessions_creator_id_fkey(id, name, avatar_url, is_test_account, banned, deleted_at, is_instructor, created_at)';

/** Every public session in 60 days is a few hundred rows today; this is the ceiling. */
const QUERY_LIMIT = 3000;

export const ROSTER_REVALIDATE_SECONDS = 300;

async function queryRoster(today: string): Promise<RosterCoach[]> {
  const { data, error } = await getServiceRoleClient()
    .from('sessions')
    .select(SELECT)
    .eq('status', 'active')
    .eq('visibility', 'public')
    // T-JOIN1b: a test session counts for nobody.
    .eq('is_test', false)
    .gte('date', addDays(today, -ROSTER_WINDOW_DAYS))
    .order('date', { ascending: false })
    .limit(QUERY_LIMIT);
  if (error) {
    logError(error, { action: 'site.fetchRoster' });
    return [];
  }
  return buildRoster((data ?? []) as unknown as RosterSessionRow[], today);
}

/** Every coach card, in roster order. Empty on any failure. */
export const fetchRoster = cache(async (): Promise<RosterCoach[]> => {
  const today = bogotaToday();
  try {
    return await unstable_cache(() => queryRoster(today), ['site-roster', today], {
      revalidate: ROSTER_REVALIDATE_SECONDS,
      tags: ['site-roster'],
    })();
  } catch (error) {
    logError(error, { action: 'site.fetchRoster' });
    return [];
  }
});
