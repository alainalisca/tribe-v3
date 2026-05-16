/**
 * GET /api/tribe-os/dashboard/stats
 *
 * Returns the four KPI numbers that render at the top of the new
 * dashboard, each with a delta-vs-last-month indicator:
 *
 *   - total_members         — every non-archived client on the roster
 *                              (active + lead + lapsed + watch, etc.)
 *   - active_sessions_today — sessions on the schedule for today's
 *                              local date (any time)
 *   - monthly_revenue       — gross in the current calendar month
 *                              (USD + COP collapsed into one card UI-side)
 *   - retention_rate        — share of last-month-active clients who
 *                              are still active this month, expressed
 *                              as a percentage
 *
 * Each metric returns both the current value and the prior-month
 * value so the UI can render a delta arrow. Failures are isolated
 * per metric — a single failed query degrades that one card to "—"
 * rather than failing the whole widget.
 *
 * Response (200):
 *   { success: true, data: {
 *       total_members:        { current: number, prior: number } | null,
 *       active_sessions_today:{ current: number }                | null,
 *       monthly_revenue:      { current: { USD?: number, COP?: number },
 *                               prior:   { USD?: number, COP?: number } } | null,
 *       retention_rate:       { current: number | null, prior: number | null } | null,
 *     }
 *   }
 *
 * Failures: 401, 403, 500 — same gate semantics as other premium routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getRevenueSummary, getRevenueSummaryForGym } from '@/lib/dal/revenue';

interface DashboardStats {
  total_members: { current: number; prior: number } | null;
  active_sessions_today: { current: number } | null;
  monthly_revenue: {
    current: { USD?: number; COP?: number };
    prior: { USD?: number; COP?: number };
  } | null;
  retention_rate: { current: number | null; prior: number | null } | null;
}

/** First + last day of the given month (0-indexed) as YYYY-MM-DD UTC. */
function monthRange(year: number, month: number): { from: string; to: string } {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const now = new Date();
    const thisMonth = monthRange(now.getUTCFullYear(), now.getUTCMonth());
    const lastMonth = monthRange(now.getUTCFullYear(), now.getUTCMonth() - 1);
    const today = todayUtc();

    // Total members (non-archived). Build a base query so we can
    // also derive "active last month" + "active this month" for
    // retention.
    function baseMembersQuery() {
      const q = supabase.from('clients').select('id, status, created_at, last_seen_at', { count: 'exact' });
      return gymId ? q.eq('gym_id', gymId) : q.eq('instructor_user_id', userId);
    }

    const allMembersPromise = baseMembersQuery().eq('archived', false);

    // Members count at end of last month: created on or before the
    // last day of last month AND not archived. Approximates the
    // denominator for retention.
    const lastMonthEndIso = `${lastMonth.to}T23:59:59.999Z`;
    const priorMonthMembersPromise = baseMembersQuery().eq('archived', false).lte('created_at', lastMonthEndIso);

    // Sessions today.
    const sessionsTodayQuery = supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .eq('date', today);

    // Revenue this month + last month, in parallel.
    const revenueThisPromise = gymId
      ? getRevenueSummaryForGym(supabase, gymId, thisMonth.from, thisMonth.to, { currency: 'all' })
      : getRevenueSummary(supabase, userId, thisMonth.from, thisMonth.to, { currency: 'all' });
    const revenueLastPromise = gymId
      ? getRevenueSummaryForGym(supabase, gymId, lastMonth.from, lastMonth.to, { currency: 'all' })
      : getRevenueSummary(supabase, userId, lastMonth.from, lastMonth.to, { currency: 'all' });

    const [allMembersResult, priorMembersResult, sessionsTodayResult, revenueThisResult, revenueLastResult] =
      await Promise.all([
        allMembersPromise,
        priorMonthMembersPromise,
        sessionsTodayQuery,
        revenueThisPromise,
        revenueLastPromise,
      ]);

    if (allMembersResult.error) {
      logError(allMembersResult.error, { action: 'dashboard.stats.members_total', userId, gymId });
    }
    if (priorMembersResult.error) {
      logError(priorMembersResult.error, { action: 'dashboard.stats.members_prior', userId, gymId });
    }
    if (sessionsTodayResult.error) {
      logError(sessionsTodayResult.error, { action: 'dashboard.stats.sessions_today', userId, gymId });
    }

    // Retention: of clients who existed last month with status =
    // 'active' (or last_seen_at within last month), how many are
    // currently status = 'active' (or last_seen_at within this month)?
    // We compute this in JS over the rows we already have.
    let retention: { current: number | null; prior: number | null } | null = null;
    if (!allMembersResult.error && !priorMembersResult.error) {
      // "Active last month" = created before lastMonth.to AND status active or last_seen_at within last month.
      const lastMonthStart = new Date(`${lastMonth.from}T00:00:00.000Z`).getTime();
      const lastMonthEnd = new Date(`${lastMonth.to}T23:59:59.999Z`).getTime();
      const thisMonthStart = new Date(`${thisMonth.from}T00:00:00.000Z`).getTime();

      type Row = { id: string; status: string | null; last_seen_at: string | null; created_at: string };
      const priorRows = (priorMembersResult.data ?? []) as Row[];
      const currentRows = (allMembersResult.data ?? []) as Row[];

      const wasActiveLastMonth = priorRows.filter((r) => {
        if (r.status === 'active' || r.status === 'watch' || r.status === 'at_risk') {
          // Status-based: counts unless they were explicitly inactive/lapsed/churned.
          const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : null;
          if (seen == null) return false;
          return seen >= lastMonthStart && seen <= lastMonthEnd;
        }
        return false;
      });

      const stillActiveSet = new Set(
        currentRows
          .filter((r) => {
            const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : null;
            if (seen == null) return false;
            return seen >= thisMonthStart;
          })
          .map((r) => r.id)
      );

      const denom = wasActiveLastMonth.length;
      const retained = wasActiveLastMonth.filter((r) => stillActiveSet.has(r.id)).length;
      const currentRate = denom > 0 ? Math.round((retained / denom) * 1000) / 10 : null;

      // For the "prior" delta number we'd need three-month-back data; for now we surface null
      // and the UI hides the delta. Computing a meaningful retention delta requires real
      // historical snapshots which we don't have yet.
      retention = { current: currentRate, prior: null };
    }

    const data: DashboardStats = {
      total_members: allMembersResult.error
        ? null
        : {
            current: allMembersResult.count ?? 0,
            prior: priorMembersResult.error ? (allMembersResult.count ?? 0) : (priorMembersResult.count ?? 0),
          },
      active_sessions_today: sessionsTodayResult.error ? null : { current: sessionsTodayResult.count ?? 0 },
      monthly_revenue: {
        current: {},
        prior: {},
      },
      retention_rate: retention,
    };

    if (revenueThisResult.success && revenueThisResult.data && data.monthly_revenue) {
      if (revenueThisResult.data.totals.USD) {
        data.monthly_revenue.current.USD = revenueThisResult.data.totals.USD.gross_cents;
      }
      if (revenueThisResult.data.totals.COP) {
        data.monthly_revenue.current.COP = revenueThisResult.data.totals.COP.gross_cents;
      }
    }
    if (revenueLastResult.success && revenueLastResult.data && data.monthly_revenue) {
      if (revenueLastResult.data.totals.USD) {
        data.monthly_revenue.prior.USD = revenueLastResult.data.totals.USD.gross_cents;
      }
      if (revenueLastResult.data.totals.COP) {
        data.monthly_revenue.prior.COP = revenueLastResult.data.totals.COP.gross_cents;
      }
    }
    if (!revenueThisResult.success) {
      logError(new Error(revenueThisResult.error ?? 'unknown'), {
        action: 'dashboard.stats.revenue_this',
        userId,
        gymId,
      });
    }
    if (!revenueLastResult.success) {
      logError(new Error(revenueLastResult.error ?? 'unknown'), {
        action: 'dashboard.stats.revenue_last',
        userId,
        gymId,
      });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/stats' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
