/**
 * GET /api/me/training
 *
 * Member-facing endpoint. Returns the signed-in user's client
 * records across every gym they belong to. When ?client_id=<uuid> is
 * passed, returns the full training record for that client (after
 * verifying its email matches the authenticated user).
 *
 * Why this lives at /api/me/* rather than /api/tribe-os/*: the
 * Tribe.OS surface is owned by the coach (premium). Members aren't
 * premium themselves — they're regular Tribe users whose coach added
 * them as a client. The me-namespace makes that distinction explicit
 * at the URL level.
 *
 * Auth:
 *   - Requires a signed-in Tribe user (any tier, premium or not)
 *   - Identity match is by email — the DAL double-checks that the
 *     authenticated user's email matches clients.email before
 *     returning any data
 *
 * Response shapes:
 *   GET /api/me/training
 *     → { success: true, data: { memberships: MyMembership[] } }
 *   GET /api/me/training?client_id=<uuid>
 *     → { success: true, data: { record: MyTrainingRecord | null } }
 *
 * Failures:
 *   401 not signed in
 *   404 client_id provided but no matching record (or wrong owner)
 *   500 server / DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { getMyTrainingRecord, listMyMemberships } from '@/lib/dal/memberSelf';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id');

    // Detail path: caller wants the full record for one membership.
    // DAL verifies email match — we never trust the client_id alone.
    if (clientId) {
      const result = await getMyTrainingRecord(clientId, user.email);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
      }
      if (!result.data) {
        return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { record: result.data } });
    }

    // List path: every (gym, client) record the user can see.
    const result = await listMyMemberships(user.email);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { memberships: result.data ?? [] } });
  } catch (error) {
    logError(error, { route: 'GET /api/me/training' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
