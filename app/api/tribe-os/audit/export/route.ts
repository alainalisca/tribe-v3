/**
 * GET /api/tribe-os/audit/export
 *
 * Streams the gym's audit log as a CSV file. Same access model as
 * /api/tribe-os/audit (any coach in the gym, via RLS) — the export
 * is just a different rendering of the same data the in-app viewer
 * already exposes.
 *
 * Why: owners with compliance obligations or external accountants
 * want a flat file they can keep. The 100-row paginated UI on
 * /os/audit is great for "what happened recently" but not for
 * year-end forensics where someone wants a single artifact.
 *
 * Query params (all optional):
 *   - action       — exact match (e.g. 'client.purge')
 *   - target_type  — exact match (e.g. 'client')
 *   - from         — ISO date or YYYY-MM-DD lower bound on created_at
 *   - to           — ISO date or YYYY-MM-DD upper bound on created_at
 *
 * Hard upper limit of 5000 rows per export. Past that the file gets
 * unwieldy for Excel and the viewer is a better fit anyway. If a
 * gym genuinely needs more, paginating exports by date range is the
 * right escape hatch.
 *
 * Response (200):
 *   text/csv; charset=utf-8 with UTF-8 BOM
 *   Content-Disposition: attachment; filename="tribe-os-audit-YYYY-MM-DD.csv"
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { generateAuditLogCsv } from '@/lib/dal/auditLog';
import { buildCsvResponse, buildExportFilename } from '@/lib/csv/serialize';

function parseIsoOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
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
    // Resolve gym (mirrors /api/tribe-os/audit). We need the id and
    // the slug for the filename to be self-identifying.
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    // Audit CSV embeds actor emails (users.email), no longer session-readable
    // after the T-SEC5 revoke; run the export under service-role, scoped to the
    // gym resolved above (the caller's own).
    const service = getServiceRoleClient();

    const url = new URL(request.url);
    const action = url.searchParams.get('action')?.trim() || undefined;
    const targetType = url.searchParams.get('target_type')?.trim() || undefined;
    const rawFrom = url.searchParams.get('from');
    const rawTo = url.searchParams.get('to');
    const fromIso = parseIsoOrNull(rawFrom);
    const toIso = parseIsoOrNull(rawTo);
    const actorUserId = url.searchParams.get('actor_user_id')?.trim() || undefined;

    if ((rawFrom && !fromIso) || (rawTo && !toIso)) {
      return NextResponse.json({ success: false, error: 'invalid_date_range' }, { status: 400 });
    }

    const result = await generateAuditLogCsv(service, gymRes.data.id, {
      action,
      targetType,
      fromIso: fromIso ?? undefined,
      toIso: toIso ?? undefined,
      actorUserId,
    });
    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'audit.export',
        userId,
        gymId: gymRes.data.id,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'export_failed' }, { status: 500 });
    }
    return buildCsvResponse(result.data, buildExportFilename(`tribe-os-audit-${gymRes.data.slug}`));
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/audit/export' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
