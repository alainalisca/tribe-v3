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

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { generateClientsCsv } from '@/lib/dal/clients';
import { buildCsvResponse, buildExportFilename } from '@/lib/csv/serialize';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    // Opt-in: ?include_teams=1 appends a 'teams' column with
    // semicolon-separated team names per client. Off by default so
    // the export stays round-trippable through the importer.
    const url = new URL(request.url);
    const includeTeams = url.searchParams.get('include_teams') === '1';

    const result = await generateClientsCsv(
      supabase,
      {
        gymId: gymId ?? null,
        instructorUserId: userId,
      },
      { includeTeams }
    );
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
