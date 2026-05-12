/**
 * GET /api/tribe-os/revenue/export
 *
 * Streams a CSV of all payments in the given period for the
 * authenticated premium creator. Built for tax-export use cases:
 * columns include both UTC and instructor-local timestamps so an
 * accountant can reconcile against either.
 *
 * Response (200):
 *   text/csv; charset=utf-8
 *   Content-Disposition: attachment; filename="tribe-os-revenue-YYYY-MM-DD-YYYY-MM-DD.csv"
 *   Body: UTF-8 BOM + RFC4180-style CSV
 *
 * Failure modes:
 *   400 invalid query params (Zod error)
 *   401 not signed in
 *   403 signed in but not Tribe.OS premium
 *   500 server / DB error
 *
 * Scaling note: the DAL caps export at 5000 rows in-memory. Beyond
 * that we'd switch to a streamed Response with a ReadableStream. Not
 * yet needed at current volume.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { isTribeOSPremiumActive } from '@/lib/dal/tribeOSPremium';
import { generatePaymentsCsv } from '@/lib/dal/revenue';
import { revenueExportQuerySchema } from '@/lib/validations/revenue';

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
        action: 'revenue_export.premium_check',
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
    const parsed = revenueExportQuerySchema.safeParse({
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
      format: searchParams.get('format') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'invalid_query' },
        { status: 400 }
      );
    }

    const result = await generatePaymentsCsv(supabase, user.id, parsed.data.from, parsed.data.to);
    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'revenue_export.dal',
        userId: user.id,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'export_failed' }, { status: 500 });
    }

    const filename = `tribe-os-revenue-${parsed.data.from}-${parsed.data.to}.csv`;

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Discourage CDN caching of personal financial data.
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/revenue/export' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
