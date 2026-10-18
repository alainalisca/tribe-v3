/**
 * T-JOIN1 Part C, revised in T-JOIN1b: who may appear in a public list. ONE
 * rule for the feed, the site board and roster, the coach page and card, the
 * instructor list, the partner lists and search: never a test account
 * (users.is_test_account), a banned or a deleted user.
 *
 * Admins are ordinary here since T-JOIN1b (Al, 2026-10-18): an admin hosts
 * real sessions everyone sees, and a test session is marked on the session
 * itself (sessions.is_test, migration 222) instead of hiding everything an
 * admin hosts.
 *
 * Two shapes:
 *
 *   isVisibleUser(row)            JS, for rows a read selected with
 *                                 VISIBLE_USER_FLAGS (the site board and
 *                                 roster, the coach card).
 *   visibleUsersFilter(q, opts)   PostgREST, for any client: the same three
 *                                 flags on the row, or on an embedded users
 *                                 resource with `prefix` (the embed must be
 *                                 `!inner`, or PostgREST keeps the parent
 *                                 with a null user).
 *
 * Lists of OTHER people only. The signed-in user's own row, the admin check
 * (is_app_admin()) and the admin shield never go through it.
 */

/** The three columns isVisibleUser reads. */
export const VISIBLE_USER_FLAGS = 'is_test_account, banned, deleted_at';

export type VisibilityFlags = {
  is_test_account?: boolean | null;
  banned?: boolean | null;
  deleted_at?: string | null;
};

export function isVisibleUser<T extends VisibilityFlags>(user: T | null | undefined): user is T {
  return !!user && !user.is_test_account && !user.banned && !user.deleted_at;
}

/** The PostgREST chain methods the filter uses; every query builder has them. */
type Filterable<Q> = {
  not(column: string, operator: string, value: unknown): Q;
  is(column: string, value: null): Q;
};

/**
 * Adds the visibility rule to a query. `prefix` is 'creator.' (or 'user.')
 * when the users row is an embedded resource. `not ... is true` rather than
 * `eq false`: banned and is_test_account are nullable on old rows.
 */
export function visibleUsersFilter<Q extends Filterable<Q>>(query: Q, { prefix = '' }: { prefix?: string } = {}): Q {
  return query
    .not(`${prefix}is_test_account`, 'is', true)
    .not(`${prefix}banned`, 'is', true)
    .is(`${prefix}deleted_at`, null);
}
