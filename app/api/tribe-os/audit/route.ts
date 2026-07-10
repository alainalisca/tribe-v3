/**
 * GET /api/tribe-os/audit
 *
 * Returns the most recent audit-log entries for the caller's gym,
 * newest first. Used by the /os/audit forensic viewer.
 *
 * Auth:
 *   - Tribe.OS premium gate (caller must be a coach in this gym)
 *   - Migration 082's RLS allows any coach in the gym to SELECT, so
 *     this endpoint mirrors that. Non-owner coaches CAN see the log;
 *     that's intentional (forensic visibility is a multi-coach trust
 *     feature). Owner-only restriction would defeat the point.
 *
 * Query params (all optional):
 *   - action       — exact match, e.g. 'client.purge'
 *   - target_type  — exact match, e.g. 'client'
 *   - limit        — page size, 1–100, default 50
 *
 * Response: { success: true, data: { entries: AuditLogRow[] } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { listAuditEntries } from '@/lib/dal/auditLog';

/**
 * Accept YYYY-MM-DD (treated as UTC midnight) or any full ISO
 * timestamp. Returns undefined for missing/blank/malformed values
 * so the caller can pass through directly to the DAL without a
 * separate "did the user send a date" check.
 */
function parseIsoLoose(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    // Gym resolution stays on the session client (RLS-enforced): the caller can
    // only resolve a gym they own/coach.
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    // The audit read embeds actor emails (users.email), no longer session-
    // readable after the T-SEC5 revoke, so it runs under service-role — scoped
    // to the gym just resolved above (the caller's own).
    const service = getServiceRoleClient();

    const url = new URL(request.url);
    const action = url.searchParams.get('action')?.trim() || undefined;
    const targetType = url.searchParams.get('target_type')?.trim() || undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    // `from` and `to` accept either YYYY-MM-DD or full ISO. Parse
    // permissively: a malformed param is silently dropped rather
    // than failing the request — the viewer is read-only and over-
    // returning is safer than under-returning. The route layer
    // doesn't validate beyond "is this a parseable date" because
    // PostgREST will safely reject a bogus value at query time.
    const fromIso = parseIsoLoose(url.searchParams.get('from'));
    const toIso = parseIsoLoose(url.searchParams.get('to'));
    const actorUserId = url.searchParams.get('actor_user_id')?.trim() || undefined;

    const result = await listAuditEntries(service, gymRes.data.id, {
      action,
      targetType,
      limit: Number.isFinite(limit) ? limit : undefined,
      fromIso,
      toIso,
      actorUserId,
    });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { entries: result.data ?? [] },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/audit' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
