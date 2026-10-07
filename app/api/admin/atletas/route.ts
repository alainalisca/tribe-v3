/**
 * POST /api/admin/atletas (T-AV27b): Tribe staff create a program for a
 * partner, or switch one on or off.
 *
 * THE ADMIN'S OWN SESSION, NEVER THE SERVICE ROLE (Al, 2026-10-01). Two
 * independent layers, and the mutation proof removes each
 * (t-av27b-mutations.LOCAL.sh, arms A1 to A3):
 *   1. this route: is_app_admin(), else 404
 *   2. the database: INSERT needs "Admins create programs"; switching
 *      is_active raises 42501 in av_athlete_programs_guard for a non-admin,
 *      even the partner's owner, whom the UPDATE policy otherwise admits
 * Remove either alone and a gym owner still cannot turn their own program on;
 * remove both and they can.
 *
 * Body: { action: 'create', partnerId } or { action: 'set_active', partnerId, active }.
 * A non-admin, an unknown partner and a refused write all answer 404.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { athleteValueOr404 } from '@/lib/features/athleteValueServer';
import { createAthleteProgram, fetchIsAppAdmin, setProgramActive } from '@/lib/dal/athleteAdmin';
import { logError } from '@/lib/logger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { 'Cache-Control': 'private, no-store' };
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: PRIVATE });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const off = await athleteValueOr404('athletes');
  if (off) return off;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE });

    const admin = await fetchIsAppAdmin(supabase);
    if (!admin.success) return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
    if (admin.data !== true) return notFound();

    let body: { action?: unknown; partnerId?: unknown; active?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: PRIVATE });
    }
    const partnerId = typeof body.partnerId === 'string' ? body.partnerId : '';
    if (!UUID.test(partnerId)) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: PRIVATE });

    if (body.action === 'create') {
      const r = await createAthleteProgram(supabase, partnerId);
      if (!r.success && r.error === 'exists')
        return NextResponse.json({ error: 'exists' }, { status: 409, headers: PRIVATE });
      if (!r.success || !r.data) return notFound();
      return NextResponse.json({ success: true }, { headers: PRIVATE });
    }
    if (body.action === 'set_active' && typeof body.active === 'boolean') {
      const r = await setProgramActive(supabase, partnerId, body.active);
      if (!r.success || !r.data) return notFound();
      return NextResponse.json({ success: true }, { headers: PRIVATE });
    }
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: PRIVATE });
  } catch (error: unknown) {
    logError(error, { route: '/api/admin/atletas', action: 'POST' });
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
  }
}
