/**
 * /api/tribe-os/clients/[id]/partners
 *   GET — top training partners for this client, ordered by lifetime
 *         shared session count DESC.
 *
 * Powers the "trains often with" section on the member detail page —
 * one of the community-graph payoffs from migrations 075/076 (the
 * attendance trigger writes the edges; this route reads them back).
 *
 * RLS limits the result to gyms the caller coaches at. Premium gate
 * ensures only Tribe.OS premium users get here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listPartnersForMember } from '@/lib/dal/trainingPartners';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    // Caller can override the cap (e.g. a future "see all partners"
    // view) but defaults stay tight so the member detail page only
    // pulls the top edges it needs.
    const limitParam = request.nextUrl.searchParams.get('limit');
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50 ? parsedLimit : 5;

    const result = await listPartnersForMember(supabase, clientId, { limit });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { partners: result.data ?? [] } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/[id]/partners' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
