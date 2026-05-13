/**
 * GET /api/tribe-os/dashboard/stats
 *
 * Three numbers for the dashboard quick-stats widget:
 *
 *   - active_clients_count: clients with status='active' AND
 *     archived=false, scoped to the caller's gym (preferred) or
 *     instructor (legacy fallback).
 *   - this_month_gross: gross revenue in the current calendar month
 *     in the caller's gym timezone. Per currency. Pulled via
 *     gym_revenue_totals when gym context is available; legacy
 *     fallback to instructor_revenue_totals otherwise.
 *   - this_month_sessions_count: sessions the caller created with
 *     date in the current month (regardless of paid/unpaid).
 *
 * All three queries fire in parallel. Each failure is logged but
 * non-fatal — the widget renders whatever values came back and
 * shows a dash for whatever didn't.
 *
 * Response (200):
 *   { success: true, data: {
 *       active_clients_count: number,
 *       sessions_this_month: number,
 *       revenue_this_month: { USD?: number, COP?: number },
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
  active_clients_count: number | null;
  sessions_this_month: number | null;
  revenue_this_month: { USD?: number; COP?: number };
}

/**
 * Returns the first and last day of the current calendar month as
 * YYYY-MM-DD strings in UTC. The revenue functions accept date
 * strings + a timezone parameter, so we don't need to compute the
 * month boundary in the user's local zone here — the SQL function
 * does that.
 */
function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-based
  const first = new Date(Date.UTC(year, month, 1));
  // Last day of month: day 0 of next month.
  const last = new Date(Date.UTC(year, month + 1, 0));
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  };
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const { from, to } = thisMonthRange();

    // Active clients count — scope by gym (preferred) or instructor.
    let clientsQuery = supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('archived', false)
      .eq('status', 'active');
    if (gymId) {
      clientsQuery = clientsQuery.eq('gym_id', gymId);
    } else {
      clientsQuery = clientsQuery.eq('instructor_user_id', userId);
    }

    // Sessions this month — scoped by creator_id; sessions are
    // world-readable but the COUNT respects our WHERE filter so the
    // result is correctly scoped.
    const sessionsQuery = supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .gte('date', from)
      .lte('date', to);

    // Revenue this month — gym-keyed if available, user-keyed fallback.
    const revenuePromise = gymId
      ? getRevenueSummaryForGym(supabase, gymId, from, to, { currency: 'all' })
      : getRevenueSummary(supabase, userId, from, to, { currency: 'all' });

    const [clientsResult, sessionsResult, revenueResult] = await Promise.all([
      clientsQuery,
      sessionsQuery,
      revenuePromise,
    ]);

    const data: DashboardStats = {
      active_clients_count: clientsResult.error ? null : (clientsResult.count ?? 0),
      sessions_this_month: sessionsResult.error ? null : (sessionsResult.count ?? 0),
      revenue_this_month: {},
    };

    if (clientsResult.error) {
      logError(clientsResult.error, { action: 'dashboard.stats.clients', userId, gymId });
    }
    if (sessionsResult.error) {
      logError(sessionsResult.error, { action: 'dashboard.stats.sessions', userId, gymId });
    }

    if (revenueResult.success && revenueResult.data) {
      if (revenueResult.data.totals.USD) {
        data.revenue_this_month.USD = revenueResult.data.totals.USD.gross_cents;
      }
      if (revenueResult.data.totals.COP) {
        data.revenue_this_month.COP = revenueResult.data.totals.COP.gross_cents;
      }
    } else {
      logError(new Error(revenueResult.error ?? 'unknown'), {
        action: 'dashboard.stats.revenue',
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
