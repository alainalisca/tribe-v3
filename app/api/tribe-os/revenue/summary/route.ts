/**
 * GET /api/tribe-os/revenue/summary
 *
 * Returns per-currency totals + a time-series of revenue buckets for a
 * creator over an inclusive date range. Auto-picks weekly buckets for
 * ranges up to 90 days, monthly for longer (overridable via `groupBy`).
 *
 * Response shape (200):
 *   { success: true, data: RevenueSummary }
 *   where RevenueSummary has totals (per-currency), buckets (time series),
 *   currency_default ('USD' | 'COP'), and group_by ('week' | 'month').
 *
 * Failure modes:
 *   400 invalid query params (Zod error)
 *   401 not signed in
 *   403 signed in but not Tribe.OS premium
 *   500 server / DB error
 *
 * Auth model: the route reads auth.uid() from the session and passes it
 * as p_user_id to the underlying SQL functions. The functions are
 * SECURITY DEFINER and trust the caller — this layer is the gate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getRevenueSummary, getRevenueSummaryForGym } from '@/lib/dal/revenue';
import { revenueSummaryQuerySchema } from '@/lib/validations/revenue';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    // Validate query params
    const { searchParams } = new URL(request.url);
    const parsed = revenueSummaryQuerySchema.safeParse({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      currency: searchParams.get('currency') ?? undefined,
      groupBy: searchParams.get('groupBy') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'invalid_query' },
        { status: 400 }
      );
    }

    // Prefer gym-keyed path when a gym context is available. The gym
    // wrapper resolves to the gym owner's user id and delegates to
    // the same SQL functions under the hood — Week 2 Mission 2 swaps
    // the SQL for gym-aware variants without changing this route.
    const result = gymId
      ? await getRevenueSummaryForGym(supabase, gymId, parsed.data.from, parsed.data.to, {
          currency: parsed.data.currency,
          groupBy: parsed.data.groupBy,
        })
      : await getRevenueSummary(supabase, userId, parsed.data.from, parsed.data.to, {
          currency: parsed.data.currency,
          groupBy: parsed.data.groupBy,
        });

    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'revenue_summary.dal',
        userId,
        gymId,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'summary_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/revenue/summary' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
