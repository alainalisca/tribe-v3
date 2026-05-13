/**
 * GET /api/tribe-os/clients/export
 *
 * Streams a CSV of every non-archived client in the gym. Columns are
 * a strict superset of the import format so a coach can round-trip:
 * export → edit in Excel → re-import without renaming anything.
 *
 * Used for:
 *   - Tool migration (moving away from a previous CRM)
 *   - Accountant handoffs at year-end
 *   - Sanity-checking the in-app list against the source of truth
 *
 * Response (200):
 *   text/csv; charset=utf-8 with UTF-8 BOM
 *   Content-Disposition: attachment; filename="tribe-os-clients-YYYY-MM-DD.csv"
 *
 * Failures:
 *   401 not signed in
 *   403 not premium
 *   500 server / DB
 */

import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { generateClientsCsv } from '@/lib/dal/clients';
import { buildCsvResponse, buildExportFilename } from '@/lib/csv/serialize';

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const result = await generateClientsCsv(supabase, {
      gymId: gymId ?? null,
      instructorUserId: userId,
    });
    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'clients.export',
        userId,
        gymId,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'export_failed' }, { status: 500 });
    }
    return buildCsvResponse(result.data, buildExportFilename('tribe-os-clients'));
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/export' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
