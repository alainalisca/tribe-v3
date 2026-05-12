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
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { isTribeOSPremiumActive } from '@/lib/dal/tribeOSPremium';
import { listPayments } from '@/lib/dal/revenue';
import { revenuePaymentsQuerySchema } from '@/lib/validations/revenue';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('tribe_os_tier, tribe_os_status')
      .eq('id', user.id)
      .single();
    if (profileErr || !profile) {
      logError(profileErr ?? new Error('profile_missing'), {
        action: 'revenue_payments.premium_check',
        userId: user.id,
      });
      return NextResponse.json({ success: false, error: 'profile_lookup_failed' }, { status: 500 });
    }
    if (!isTribeOSPremiumActive(profile)) {
      return NextResponse.json(
        { success: false, error: 'premium_required', hint: 'upgrade_to_tribe_os' },
        { status: 403 }
      );
    }

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

    const result = await listPayments(supabase, user.id, parsed.data.from, parsed.data.to, {
      currency: parsed.data.currency,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      sort: parsed.data.sort,
    });

    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'revenue_payments.dal',
        userId: user.id,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'payments_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/revenue/payments' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
