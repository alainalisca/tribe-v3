import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listVisitsForClient } from '@/lib/dal/clients';
import { recomputeMemberRetention } from '@/lib/tribe-os/retention/recompute-member';

const ManualVisitSchema = z.object({
  visited_at: z.string().datetime(),
  coach_name: z.string().max(200).optional(),
  class_name: z.string().max(200).optional(),
});

const ROUTE = 'POST /api/tribe-os/clients/[id]/visits';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = ManualVisitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const { visited_at, coach_name, class_name } = parsed.data;

    const twoHoursMs = 2 * 60 * 60 * 1000;
    const visitTime = new Date(visited_at).getTime();
    const windowStart = new Date(visitTime - twoHoursMs).toISOString();
    const windowEnd = new Date(visitTime + twoHoursMs).toISOString();

    const { data: nearby } = await supabase
      .from('client_visits')
      .select('id')
      .eq('gym_id', gymId)
      .eq('client_id', clientId)
      .gte('visited_at', windowStart)
      .lte('visited_at', windowEnd)
      .limit(1)
      .maybeSingle();

    if (nearby) {
      return NextResponse.json({ success: false, error: 'duplicate_visit' }, { status: 409 });
    }

    const { data: visit, error: insertErr } = await supabase
      .from('client_visits')
      .insert({
        gym_id: gymId,
        client_id: clientId,
        visited_at,
        source: 'manual',
        coach_name: coach_name ?? null,
        class_name: class_name ?? null,
      })
      .select('id')
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return NextResponse.json({ success: false, error: 'duplicate_visit' }, { status: 409 });
      }
      throw insertErr;
    }

    const recompute = await recomputeMemberRetention(supabase, gymId, clientId, ROUTE);

    fetch('/api/tribe-os/sequences/reconcile', { method: 'POST' }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: { id: visit.id },
      recompute,
    });
  } catch (error) {
    logError(error, { route: ROUTE });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10));
    const result = await listVisitsForClient(supabase, clientId, page);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'list_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/[id]/visits' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
