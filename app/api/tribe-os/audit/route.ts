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
import { listAuditEntries } from '@/lib/dal/auditLog';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action')?.trim() || undefined;
    const targetType = url.searchParams.get('target_type')?.trim() || undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    const result = await listAuditEntries(supabase, gymRes.data.id, {
      action,
      targetType,
      limit: Number.isFinite(limit) ? limit : undefined,
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
