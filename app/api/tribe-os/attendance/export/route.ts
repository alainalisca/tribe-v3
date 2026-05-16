/**
 * GET /api/tribe-os/attendance/export
 *
 * Streams a CSV of every attendance row in the gym, joined with the
 * client name and session display fields. Optional ?from=ISO &
 * to=ISO query params filter on attended_at — useful for tax-year
 * exports ("everyone who showed up in 2025").
 *
 * Pairs with the revenue CSV export: payments are one row per
 * Stripe charge; attendance is one row per check-in. Together they
 * reconcile any "did this person actually train on the day they
 * paid?" question.
 *
 * Response (200):
 *   text/csv; charset=utf-8 with UTF-8 BOM
 *   Content-Disposition: attachment; filename="tribe-os-attendance-YYYY-MM-DD.csv"
 *
 * Failures:
 *   400 invalid date range
 *   401 not signed in
 *   403 not premium
 *   500 server / DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { generateAttendanceCsv } from '@/lib/dal/clients';
import { buildCsvResponse, buildExportFilename } from '@/lib/csv/serialize';

/**
 * Lightweight ISO-date validator — accepts YYYY-MM-DD or full
 * ISO-8601 timestamps. Returns null for inputs that don't parse.
 * (We don't pull Zod here because the schema is tiny and the route
 * already does only-ours-not-third-party validation.)
 */
function parseIsoOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // YYYY-MM-DD → start-of-day UTC, so an end-of-range "to=2025-12-31"
  // doesn't silently miss everything on Dec 31. The DAL applies the
  // filter to attended_at, which is a timestamptz; this keeps the
  // semantics easy to reason about for users typing date strings.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const rawFrom = url.searchParams.get('from');
    const rawTo = url.searchParams.get('to');
    const fromIso = parseIsoOrNull(rawFrom);
    const toIso = parseIsoOrNull(rawTo);

    if ((rawFrom && !fromIso) || (rawTo && !toIso)) {
      return NextResponse.json({ success: false, error: 'invalid_date_range' }, { status: 400 });
    }

    const result = await generateAttendanceCsv(
      supabase,
      { gymId: gymId ?? null, instructorUserId: userId },
      { fromIso: fromIso ?? undefined, toIso: toIso ?? undefined }
    );
    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'attendance.export',
        userId,
        gymId,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'export_failed' }, { status: 500 });
    }
    return buildCsvResponse(result.data, buildExportFilename('tribe-os-attendance'));
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/attendance/export' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
