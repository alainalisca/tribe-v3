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
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { generatePaymentsCsv, generatePaymentsCsvForGym } from '@/lib/dal/revenue';
import { revenueExportQuerySchema } from '@/lib/validations/revenue';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
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

    // Prefer gym-keyed path when a gym context is available. Same
    // owner-resolution pattern as the summary + payments routes.
    const result = gymId
      ? await generatePaymentsCsvForGym(supabase, gymId, parsed.data.from, parsed.data.to)
      : await generatePaymentsCsv(supabase, userId, parsed.data.from, parsed.data.to);
    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'revenue_export.dal',
        userId,
        gymId,
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
