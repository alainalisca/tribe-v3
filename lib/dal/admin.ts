/** DAL: admin-specific aggregate queries for the admin dashboard */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { AdminReport, AdminFeedback, AdminBug, AdminSession, AdminMessage } from '@/app/admin/types';

// --- Stats helper types ---

export interface AdminStatsRaw {
  userCount: number;
  activeSessionCount: number;
  messageCount: number;
  newUsersToday: number;
  allSessions: Array<{
    id: string;
    status: string;
    date: string;
    // QA-13: was `participants_count` (wrong column). Real column on the
    // sessions table is `current_participants`. Using the wrong name returned
    // null for the whole row, which zeroed every downstream stat.
    current_participants: number | null;
    sport: string;
    creator_id: string;
  }>;
  allSessionCreators: Array<{ creator_id: string }>;
  allParticipants: Array<{ user_id: string }>;
}

/**
 * Fetches all raw data needed to compute admin dashboard statistics.
 * Returns counts and row-level data for client-side aggregation.
 */
export async function fetchAdminStatsRaw(supabase: SupabaseClient): Promise<DalResult<AdminStatsRaw>> {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      { count: userCount },
      { count: activeSessionCount },
      { count: messageCount },
      { count: newUsers },
      { data: allSessions },
      { data: allSessionCreators },
      { data: allParticipants },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('date', today),
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .gte('created_at', todayStart.toISOString()),
      supabase.from('sessions').select('id, status, date, current_participants, sport, creator_id'),
      supabase.from('sessions').select('creator_id'),
      supabase.from('session_participants').select('user_id'),
    ]);

    return {
      success: true,
      data: {
        userCount: userCount || 0,
        activeSessionCount: activeSessionCount || 0,
        messageCount: messageCount || 0,
        newUsersToday: newUsers || 0,
        allSessions: allSessions || [],
        allSessionCreators: allSessionCreators || [],
        allParticipants: allParticipants || [],
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchAdminStatsRaw' });
    return { success: false, error: 'Failed to fetch admin stats' };
  }
}

/** ADMIN-01: how the users list is narrowed. Applied SERVER side -- a client-side
 *  filter over the page would only ever search the newest 100 rows, which is the
 *  bug this replaces: a user outside that window looked like they did not exist. */
export const ADMIN_USER_FILTERS = ['all', 'instructors', 'athletes', 'test', 'banned', 'new'] as const;
export const ADMIN_USER_SORTS = ['newest', 'last_active', 'most_hosted'] as const;
export type AdminUserFilter = (typeof ADMIN_USER_FILTERS)[number];
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];

export interface AdminUserQuery {
  search?: string;
  filter?: AdminUserFilter;
  sort?: AdminUserSort;
  limit?: number;
}

export const ADMIN_USERS_PAGE_SIZE = 100;

/** PostgREST builds `or=(name.ilike.*x*,email.ilike.*x*)` as a STRING, so a comma
 *  or paren in the term silently changes the filter's shape rather than matching
 *  literally. Values are still parameterised -- this is a correctness guard, not
 *  an injection one. `%` and `_` are stripped so a user cannot turn their search
 *  into a wildcard that matches the whole table. */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()*%_\\"']/g, ' ').trim();
}

/**
 * Fetches users for the admin user management tab, with session created/joined counts.
 *
 * ADMIN-01: search, filter and sort are all applied server side. The page size is
 * still 100, but the WINDOW now moves -- a search covers the whole table instead
 * of the first page of it.
 */
export async function fetchAdminUsersWithCounts(
  supabase: SupabaseClient,
  query: AdminUserQuery = {}
): Promise<
  DalResult<{
    users: unknown[];
    sessionCounts: Array<{ creator_id: string }>;
    participantCounts: Array<{ user_id: string }>;
  }>
> {
  const { search = '', filter = 'all', sort = 'newest', limit = ADMIN_USERS_PAGE_SIZE } = query;
  try {
    let usersQuery = supabase
      .from('users')
      .select(
        // is_test_account added by ADMIN-01: the panel could not tell a real
        // signup from a seeded one, which is the first question asked of this list.
        'id, name, email, avatar_url, bio, location, sports, preferred_sports, specialties, is_instructor, is_verified_instructor, is_admin, is_test_account, banned, created_at, updated_at, last_login_at, sessions_completed, average_rating, total_reviews, follower_count, following_count'
      )
      // Exclude soft-deleted users. The admin delete button calls the
      // admin_delete_user RPC which sets deleted_at = NOW() (migration 050).
      // Without this filter the "deleted" user reappeared on the next list
      // reload — the row was gone optimistically, then re-fetched.
      .is('deleted_at', null);

    switch (filter) {
      case 'instructors':
        usersQuery = usersQuery.eq('is_instructor', true);
        break;
      case 'athletes':
        // NOT true, not `eq false`: is_instructor is nullable and a null is an
        // athlete. `eq('is_instructor', false)` would silently drop every null.
        usersQuery = usersQuery.not('is_instructor', 'is', true);
        break;
      case 'test':
        // eq, not `not is false`: is_test_account is `boolean NOT NULL DEFAULT
        // false` (migration 052), so there are no nulls to miss here. That is
        // NOT true of is_instructor above, which is nullable.
        usersQuery = usersQuery.eq('is_test_account', true);
        break;
      case 'banned':
        usersQuery = usersQuery.eq('banned', true);
        break;
      case 'new':
        usersQuery = usersQuery.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
        break;
      case 'all':
      default:
        break;
    }

    const term = sanitizeSearch(search);
    if (term) {
      usersQuery = usersQuery.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
    }

    switch (sort) {
      case 'last_active':
        // nullsFirst:false — an account that has NEVER logged in must sort to the
        // bottom of "last active", not the top. Postgres defaults DESC to NULLS
        // FIRST, which would put every dormant account above every live one.
        usersQuery = usersQuery.order('last_login_at', { ascending: false, nullsFirst: false });
        break;
      case 'most_hosted':
        // total_sessions_hosted is NOT in the select list (ADMIN-01 scope), but
        // ordering does not require selecting. It is also the one instructor
        // counter that moves correctly for everyone -- DRIFT-03 froze
        // total_participants_served and total_earnings_cents, not this one.
        usersQuery = usersQuery.order('total_sessions_hosted', { ascending: false, nullsFirst: false });
        break;
      case 'newest':
      default:
        usersQuery = usersQuery.order('created_at', { ascending: false });
        break;
    }

    const [{ data, error }, { data: sessionCounts }, { data: participantCounts }] = await Promise.all([
      usersQuery.limit(limit),
      supabase.from('sessions').select('creator_id'),
      supabase.from('session_participants').select('user_id'),
    ]);
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: {
        users: data || [],
        sessionCounts: sessionCounts || [],
        participantCounts: participantCounts || [],
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchAdminUsersWithCounts' });
    return { success: false, error: 'Failed to fetch admin users' };
  }
}

/**
 * Fetches reported users with reporter/reported user details.
 */
export async function fetchAdminReports(supabase: SupabaseClient): Promise<DalResult<AdminReport[]>> {
  try {
    const { data, error } = await supabase
      .from('reported_users')
      .select(
        // reporter email is never displayed (only reported.email is shown), so
        // it is not selected. reported.email is rendered in ReportedMessages.
        `*, reporter:users!reported_users_reporter_id_fkey(id, name), reported:users!reported_users_reported_user_id_fkey(id, name, email)`
      )
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as AdminReport[] };
  } catch (error) {
    logError(error, { action: 'fetchAdminReports' });
    return { success: false, error: 'Failed to fetch reports' };
  }
}

/**
 * Fetches user feedback with user details.
 */
export async function fetchAdminFeedback(supabase: SupabaseClient): Promise<DalResult<AdminFeedback[]>> {
  try {
    const { data, error } = await supabase
      .from('user_feedback')
      .select(`*, user:users(id, name, email)`)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as AdminFeedback[] };
  } catch (error) {
    logError(error, { action: 'fetchAdminFeedback' });
    return { success: false, error: 'Failed to fetch feedback' };
  }
}

/**
 * Fetches bug reports with user details.
 */
export async function fetchAdminBugs(supabase: SupabaseClient): Promise<DalResult<AdminBug[]>> {
  try {
    const { data, error } = await supabase
      .from('bug_reports')
      .select(`*, user:users(id, name, email)`)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as AdminBug[] };
  } catch (error) {
    logError(error, { action: 'fetchAdminBugs' });
    return { success: false, error: 'Failed to fetch bug reports' };
  }
}

/**
 * Fetches chat messages with user and session details for admin review.
 */
export async function fetchAdminMessages(supabase: SupabaseClient): Promise<DalResult<AdminMessage[]>> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select(`*, user:users(id, name, email), session:sessions(id, sport, location)`)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as AdminMessage[] };
  } catch (error) {
    logError(error, { action: 'fetchAdminMessages' });
    return { success: false, error: 'Failed to fetch messages' };
  }
}

/**
 * Fetches sessions with creator details for admin session management.
 *
 * QA-15: sessions are now auto-verified on creation (see migration 039).
 * The admin list was drowning in already-trusted sessions and making Al
 * verify each one manually. We now surface ONLY sessions that actually
 * need attention:
 *   - photo_verified = false (explicitly unverified, e.g. via report flow), OR
 *   - status = 'cancelled' (admin may want to follow up)
 * Everything else stays out of the admin queue.
 *
 * If the caller needs every session (e.g. for a future audit view), pass
 * `includeAll = true`.
 */
export async function fetchAdminSessions(
  supabase: SupabaseClient,
  includeAll = false
): Promise<DalResult<AdminSession[]>> {
  try {
    let query = supabase
      .from('sessions')
      // creator email is never displayed (SessionManagement shows creator.name
      // only), so it is not selected — this keeps fetchAdminSessions off the
      // email column and runnable on the browser client after the revoke.
      .select(`*, creator:users!sessions_creator_id_fkey(id, name)`)
      .order('date', { ascending: false })
      .limit(50);

    if (!includeAll) {
      // Needs-attention queue only.
      query = query.or('photo_verified.eq.false,status.eq.cancelled');
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as AdminSession[] };
  } catch (error) {
    logError(error, { action: 'fetchAdminSessions' });
    return { success: false, error: 'Failed to fetch sessions' };
  }
}

// --- Revenue metrics ---

export interface RevenueMetrics {
  totalRevenueCentsUSD: number;
  totalRevenueCentsCOP: number;
  totalPlatformFeesCentsUSD: number;
  totalPlatformFeesCentsCOP: number;
  totalPaymentsCount: number;
  failedPaymentsCount: number;
  thisMonthRevenueCentsUSD: number;
  thisMonthRevenueCentsCOP: number;
}

export async function fetchRevenueMetrics(supabase: SupabaseClient): Promise<DalResult<RevenueMetrics>> {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: allPayments } = await supabase
      .from('payments')
      .select('amount_cents, platform_fee_cents, currency, status')
      .eq('status', 'approved');

    const { count: failedCount } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['declined', 'error', 'voided']);

    const { data: monthPayments } = await supabase
      .from('payments')
      .select('amount_cents, platform_fee_cents, currency')
      .eq('status', 'approved')
      .gte('created_at', startOfMonth.toISOString());

    const metrics: RevenueMetrics = {
      totalRevenueCentsUSD: 0,
      totalRevenueCentsCOP: 0,
      totalPlatformFeesCentsUSD: 0,
      totalPlatformFeesCentsCOP: 0,
      totalPaymentsCount: allPayments?.length || 0,
      failedPaymentsCount: failedCount || 0,
      thisMonthRevenueCentsUSD: 0,
      thisMonthRevenueCentsCOP: 0,
    };

    for (const p of allPayments || []) {
      if (p.currency === 'USD') {
        metrics.totalRevenueCentsUSD += p.amount_cents || 0;
        metrics.totalPlatformFeesCentsUSD += p.platform_fee_cents || 0;
      } else {
        metrics.totalRevenueCentsCOP += p.amount_cents || 0;
        metrics.totalPlatformFeesCentsCOP += p.platform_fee_cents || 0;
      }
    }

    for (const p of monthPayments || []) {
      if (p.currency === 'USD') {
        metrics.thisMonthRevenueCentsUSD += p.amount_cents || 0;
      } else {
        metrics.thisMonthRevenueCentsCOP += p.amount_cents || 0;
      }
    }

    return { success: true, data: metrics };
  } catch (error) {
    logError(error, { action: 'fetchRevenueMetrics' });
    return { success: false, error: 'Failed to fetch revenue metrics' };
  }
}
