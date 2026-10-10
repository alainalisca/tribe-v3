/**
 * lib/dal/adminSessions.ts
 *
 * The admin "All sessions" list. fetchAdminSessions() in ./admin.ts only
 * returns the needs-attention queue (unverified or cancelled), and the panel
 * further narrowed that to sessions with photos, so there was no screen on
 * which an admin could find an ordinary session in order to delete it.
 *
 * Search runs in the query, not over the page on screen (the ADMIN-01 lesson:
 * a client-side filter over the newest N rows reads as "that session does not
 * exist" for everything older). It matches title, sport and location, and also
 * the HOST'S NAME, which is the way an admin usually remembers a session
 * ("the one Juan made"). Host matching is a second query for user ids,
 * folded into the same OR.
 *
 * Browser client is fine here: these columns are already read by the public
 * session pages, and the creator embed selects only id and name.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export const ADMIN_SESSIONS_PAGE_SIZE = 100;

export interface AdminSessionListItem {
  id: string;
  title: string | null;
  sport: string;
  location: string;
  date: string;
  start_time: string;
  status: string | null;
  is_paid: boolean | null;
  is_recurring: boolean | null;
  recurring_parent_id: string | null;
  current_participants: number | null;
  created_at: string | null;
  creator: { id: string; name: string | null } | null;
}

/** Same guard as sanitizeSearch in ./admin.ts: PostgREST's `or=` is a string,
 *  so commas and parens would change the filter's shape, and `%`/`_` would
 *  turn a search into a match-everything wildcard. */
export function sanitizeAdminSearch(term: string): string {
  return term.replace(/[,()*%_\\"']/g, ' ').trim();
}

const COLUMNS =
  'id, title, sport, location, date, start_time, status, is_paid, is_recurring, recurring_parent_id, current_participants, created_at, creator:users!sessions_creator_id_fkey(id, name)';

export async function fetchAdminAllSessions(
  supabase: SupabaseClient,
  search = ''
): Promise<DalResult<AdminSessionListItem[]>> {
  try {
    const term = sanitizeAdminSearch(search);
    const ors: string[] = [];

    if (term) {
      ors.push(`title.ilike.%${term}%`, `sport.ilike.%${term}%`, `location.ilike.%${term}%`);

      const { data: hosts, error: hostErr } = await supabase
        .from('users')
        .select('id')
        .ilike('name', `%${term}%`)
        .limit(50);
      if (hostErr) return { success: false, error: hostErr.message };
      const hostIds = (hosts ?? []).map((h: { id: string }) => h.id);
      if (hostIds.length > 0) ors.push(`creator_id.in.(${hostIds.join(',')})`);
    }

    let query = supabase
      .from('sessions')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(ADMIN_SESSIONS_PAGE_SIZE);
    if (ors.length > 0) query = query.or(ors.join(','));

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as AdminSessionListItem[] };
  } catch (error) {
    logError(error, { action: 'fetchAdminAllSessions' });
    return { success: false, error: 'Failed to fetch sessions' };
  }
}

/** True when deleting this row removes a whole repeating series. */
export function isSeriesSession(s: Pick<AdminSessionListItem, 'is_recurring' | 'recurring_parent_id'>): boolean {
  return s.is_recurring === true || s.recurring_parent_id !== null;
}
