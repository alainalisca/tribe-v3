/**
 * POST /api/atletas/gym/[partnerId]/settings (T-AV26): save the gym's program
 * settings.
 *
 * THE OWNER'S OWN SESSION, NEVER THE SERVICE ROLE. The update runs through
 * createClient() from lib/supabase/server, so it carries the caller's JWT and
 * the database decides: the "Owner or admin edits the program" UPDATE policy
 * (202) and the column grants. route.test.ts fails if this file builds a
 * client from SUPABASE_SERVICE_ROLE_KEY by any spelling.
 *
 * TWO LAYERS, and the mutation proof removes each (t-av26-mutations.LOCAL.sh):
 *   1. this route's role check: owner or admin, else 404
 *   2. RLS: a caller the policy filters out updates 0 rows, also a 404
 * Remove either alone and a coach is still refused; remove both and the
 * coach's save lands, which is the arm that must go red.
 *
 * ORDER: the flag (a 404 when off, hard line 8), the id shape, the session,
 * the role, the body. A coach, another gym's owner and an unknown partner all
 * get the same 404 body, so the route cannot tell anyone which gyms exist.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { athleteValueOr404 } from '@/lib/features/athleteValueServer';
import { fetchMyPartnerRole, type PartnerRole } from '@/lib/dal/athleteGym';
import { updateProgramSettings } from '@/lib/dal/athleteGymWrites';
import { parseProgramSettings } from '@/lib/atletas/gymSettings';
import { logError } from '@/lib/logger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { 'Cache-Control': 'private, no-store' };
const OWNER_OR_ADMIN: readonly PartnerRole[] = ['owner', 'admin'];

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: PRIVATE });

interface RouteContext {
  params: Promise<{ partnerId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const off = await athleteValueOr404('athletes');
  if (off) return off;

  const { partnerId } = await params;
  if (!UUID.test(partnerId)) return notFound();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE });
    }

    const role = await fetchMyPartnerRole(supabase, partnerId);
    if (!role.success) {
      return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
    }
    const callerRole = role.data ?? null;
    if (callerRole === null || !OWNER_OR_ADMIN.includes(callerRole)) return notFound();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers: PRIVATE });
    }
    const parsed = parseProgramSettings(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: 'invalid', field: parsed.field }, { status: 400, headers: PRIVATE });
    }

    const saved = await updateProgramSettings(supabase, partnerId, parsed.value);
    if (!saved.success) {
      return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
    }
    // RLS filtered the row out (or it does not exist): the same 404.
    if (!saved.data) return notFound();

    return NextResponse.json({ success: true }, { headers: PRIVATE });
  } catch (error: unknown) {
    logError(error, { route: '/api/atletas/gym/[partnerId]/settings', action: 'POST' });
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: PRIVATE });
  }
}
