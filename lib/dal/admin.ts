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
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('date', today),
      supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
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

/**
 * Fetches all users with session created/joined counts for the admin user management tab.
 */
export async function fetchAdminUsersWithCounts(supabase: SupabaseClient): Promise<
  DalResult<{
    users: unknown[];
    sessionCounts: Array<{ creator_id: string }>;
    participantCounts: Array<{ user_id: string }>;
  }>
> {
  try {
    const [{ data, error }, { data: sessionCounts }, { data: participantCounts }] = await Promise.all([
      supabase
        .from('users')
        .select(
          'id, name, email, avatar_url, bio, location, sports, preferred_sports, specialties, is_instructor, is_verified_instructor, is_admin, banned, created_at, updated_at, last_login_at, sessions_completed, average_rating, total_reviews, follower_count, following_count'
        )
        .order('created_at', { ascending: false })
        .limit(100),
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
        `*, reporter:users!reported_users_reporter_id_fkey(id, name, email), reported:users!reported_users_reported_user_id_fkey(id, name, email)`
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
      .select(`*, creator:users!sessions_creator_id_fkey(id, name, email)`)
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
