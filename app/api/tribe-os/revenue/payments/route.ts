/**
 * GET /api/tribe-os/revenue/payments
 *
 * Returns a paginated list of payment rows for the revenue dashboard's
 * table view. Sortable by date or amount, ascending or descending.
 *
 * Response shape (200):
 *   { success: true, data: { payments: PaymentRow[], total: number, has_more: boolean } }
 *
 * Failure modes:
 *   400 invalid query params
 *   401 not signed in
 *   403 signed in but not Tribe.OS premium
 *   500 server / DB error
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listPayments } from '@/lib/dal/revenue';
import { revenuePaymentsQuerySchema } from '@/lib/validations/revenue';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId } = gate;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = revenuePaymentsQuerySchema.safeParse({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      currency: searchParams.get('currency') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'invalid_query' },
        { status: 400 }
      );
    }

    const result = await listPayments(supabase, userId, parsed.data.from, parsed.data.to, {
      currency: parsed.data.currency,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      sort: parsed.data.sort,
    });

    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'revenue_payments.dal',
        userId,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'payments_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/revenue/payments' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
