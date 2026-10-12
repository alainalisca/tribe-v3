import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { LEAD_ACTIVITY_KINDS, ACTIVITY_BODY_MAX } from '@/lib/tribe-os/leads/constants';
import type { LeadActivityKind } from '@/lib/tribe-os/leads/constants';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('tribe_os_lead_activities')
      .select('*')
      .eq('lead_id', id)
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false });

    if (error) {
      logError(error, { route: 'GET /api/tribe-os/leads/[id]/activities', id, gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/leads/[id]/activities' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const kind = typeof b.kind === 'string' ? b.kind : '';
    const actBody = typeof b.body === 'string' ? b.body.trim() : null;

    if (!LEAD_ACTIVITY_KINDS.includes(kind as LeadActivityKind) || kind === 'status_change') {
      return NextResponse.json({ success: false, error: 'invalid_kind' }, { status: 400 });
    }
    if (actBody && actBody.length > ACTIVITY_BODY_MAX) {
      return NextResponse.json({ success: false, error: 'body_too_long' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tribe_os_lead_activities')
      .insert({
        lead_id: id,
        gym_id: gymId,
        kind,
        body: actBody || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      logError(error, { route: 'POST /api/tribe-os/leads/[id]/activities', id, gymId });
      return NextResponse.json({ success: false, error: 'create_failed' }, { status: 500 });
    }

    await supabase
      .from('tribe_os_leads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('gym_id', gymId);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/leads/[id]/activities' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
