/**
 * POST /api/admin/sessions/[id]/delete
 *
 * @description Admin hard-delete of a session (or, for a repeating series, the
 *   whole series). The rules live in lib/dal/adminSessionDelete.ts: sessions
 *   with payment records are refused, and a series is only deleted when the
 *   body says `{ "scope": "series" }`.
 * @auth Admin only, via requireApiAdmin() (the same is_app_admin() check the
 *   /admin page gates on). The service-role client is only created after that.
 * @body { scope?: 'single' | 'series' }
 * @returns 200 { success, deletedIds, wasSeries }
 *          400 bad input, 403 not admin, 404 not found,
 *          409 { error: 'series_requires_scope' | 'has_payments' | 'linked_records' },
 *          500 check or delete failed.
 */
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { adminDeleteSession, type AdminSessionDeleteError } from '@/lib/dal/adminSessionDelete';
import { logError } from '@/lib/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Record<AdminSessionDeleteError, number> = {
  session_not_found: 404,
  series_requires_scope: 409,
  has_payments: 409,
  linked_records: 409,
  check_failed: 500,
  delete_failed: 500,
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Gate first: nothing is read until the caller is a confirmed admin.
  const gate = await requireApiAdmin();
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
    }

    // Body is optional. Anything that is not a recognised scope is a 400, so a
    // typo can never be read as "single" and slip past the series check.
    let scope: 'single' | 'series' | undefined;
    const raw = await req.text();
    if (raw.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
      }
      const s = (body as { scope?: unknown } | null)?.scope;
      if (s !== undefined && s !== 'single' && s !== 'series') {
        return NextResponse.json({ error: 'invalid_scope' }, { status: 400 });
      }
      scope = s;
    }

    const result = await adminDeleteSession(gate.service, id, { scope, actorUserId: gate.userId });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });
    }
    return NextResponse.json({ success: true, ...result.data });
  } catch (error) {
    logError(error, { action: 'adminDeleteSession.route' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
