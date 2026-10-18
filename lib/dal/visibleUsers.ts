import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAdminUserIds } from './users';

/**
 * T-JOIN1 Part C: who may appear in a public list. ONE rule for the feed, the
 * site board and roster, the instructor list, the partner lists and search:
 * never an admin, a test account (users.is_test_account), a banned or a
 * deleted user.
 *
 * Two shapes, because migration 113 revoked SELECT on users.is_admin from anon
 * and authenticated (a filter that names it fails the whole read):
 *
 *   isVisibleUser(row)            JS, for rows a SERVICE-ROLE read selected
 *                                 with VISIBLE_USER_FLAGS (the site board and
 *                                 roster, the coach card).
 *   visibleUsersFilter(q, opts)   PostgREST, for any client: test, banned and
 *                                 deleted on the row (or on an embedded
 *                                 resource with `prefix`), and admins by id,
 *                                 from hiddenAdminIds().
 *
 * Admin pages, notification recipients and a user's own profile are not
 * public lists and do not use this.
 */

/** The four columns isVisibleUser reads. Service role only: anon cannot read is_admin. */
export const VISIBLE_USER_FLAGS = 'is_admin, is_test_account, banned, deleted_at';

export type VisibilityFlags = {
  is_admin?: boolean | null;
  is_test_account?: boolean | null;
  banned?: boolean | null;
  deleted_at?: string | null;
};

export function isVisibleUser<T extends VisibilityFlags>(user: T | null | undefined): user is T {
  return !!user && !user.is_admin && !user.is_test_account && !user.banned && !user.deleted_at;
}

/** The PostgREST chain methods the filter uses; every query builder has them. */
type Filterable<Q> = {
  not(column: string, operator: string, value: unknown): Q;
  is(column: string, value: null): Q;
};

/**
 * Adds the visibility rule to a query.
 *
 *   prefix    'creator.' when the users row is an embedded resource (the embed
 *             must be `!inner`, or PostgREST keeps the parent with a null user)
 *   idColumn  the column holding the user id, for the admin exclusion:
 *             'id' on a users query, 'creator_id' on sessions
 *   adminIds  from hiddenAdminIds(); empty when the caller could not get them
 *
 * `not ... is true` rather than `eq false`: banned and is_test_account are
 * nullable on old rows.
 */
export function visibleUsersFilter<Q extends Filterable<Q>>(
  query: Q,
  { prefix = '', idColumn, adminIds = [] }: { prefix?: string; idColumn: string; adminIds?: string[] }
): Q {
  let q = query
    .not(`${prefix}is_test_account`, 'is', true)
    .not(`${prefix}banned`, 'is', true)
    .is(`${prefix}deleted_at`, null);
  const ids = adminIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length > 0) q = q.not(idColumn, 'in', `(${ids.join(',')})`);
  return q;
}

/**
 * The admin exclusion alone, for users_discoverable (migration 114), which
 * already leaves out test, banned and deleted users and does not expose those
 * columns to filter on.
 */
export function withoutAdmins<Q extends Pick<Filterable<Q>, 'not'>>(query: Q, idColumn: string, adminIds: string[]): Q {
  const ids = adminIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  return ids.length > 0 ? query.not(idColumn, 'in', `(${ids.join(',')})`) : query;
}

/**
 * The admin ids to leave out. A service-role client reads them directly; a
 * signed-in client through get_admin_user_ids() (granted to authenticated
 * only). A signed-out client cannot learn them: the result is empty and the
 * caller's server side must pass them in instead (see app/instructors).
 */
export async function hiddenAdminIds(supabase: SupabaseClient, { serviceRole = false } = {}): Promise<string[]> {
  if (serviceRole) {
    const { data, error } = await supabase.from('users').select('id').eq('is_admin', true);
    return error ? [] : ((data ?? []) as { id: string }[]).map((r) => r.id);
  }
  const res = await fetchAdminUserIds(supabase);
  return res.success ? (res.data ?? []) : [];
}
