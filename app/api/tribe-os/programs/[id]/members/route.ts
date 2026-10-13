import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { bogotaToday } from '@/lib/tribe-os/dates';
import { computeMemberProgress } from '@/lib/tribe-os/programs/progress';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const { id } = await params;

    const { data: program, error: progErr } = await supabase
      .from('tribe_os_programs')
      .select('id, starts_at, ends_at, target_sessions_per_week')
      .eq('id', id)
      .eq('gym_id', gymId)
      .single();

    if (progErr || !program) {
      logError(progErr, { route: 'GET /api/tribe-os/programs/[id]/members', id, gymId });
      return NextResponse.json({ success: false, error: 'program_not_found' }, { status: 404 });
    }

    const { data: members, error: memErr } = await supabase
      .from('tribe_os_program_members')
      .select('id, client_id, assigned_at, removed_at')
      .eq('program_id', id)
      .is('removed_at', null)
      .order('assigned_at', { ascending: false });

    if (memErr) {
      logError(memErr, { route: 'GET /api/tribe-os/programs/[id]/members', id, gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    const clientIds = (members ?? []).map((m) => m.client_id);

    let clientNames: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: clients, error: cErr } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      if (cErr) {
        logError(cErr, { route: 'GET /api/tribe-os/programs/[id]/members clients', id, gymId });
      }
      clientNames = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name]));
    }

    const visitCounts: Record<string, number> = {};
    if (clientIds.length > 0 && program.starts_at) {
      const { data: visits, error: vErr } = await supabase
        .from('client_visits')
        .select('client_id')
        .eq('gym_id', gymId)
        .in('client_id', clientIds)
        .gte('visited_at', program.starts_at)
        .lte('visited_at', program.ends_at ?? bogotaToday());
      if (vErr) {
        logError(vErr, { route: 'GET /api/tribe-os/programs/[id]/members visits', id, gymId });
      }
      for (const v of visits ?? []) {
        visitCounts[v.client_id] = (visitCounts[v.client_id] ?? 0) + 1;
      }
    }

    const today = bogotaToday();
    const enriched = (members ?? []).map((m) => {
      const vc = visitCounts[m.client_id] ?? 0;
      const progress = computeMemberProgress(
        program.starts_at,
        program.ends_at,
        program.target_sessions_per_week,
        vc,
        today,
      );
      return {
        ...m,
        client_name: clientNames[m.client_id] ?? '',
        visit_count: vc,
        progress,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/programs/[id]/members' });
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
    const clientId = typeof b.client_id === 'string' ? b.client_id.trim() : '';
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'missing_client_id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tribe_os_program_members')
      .insert({
        program_id: id,
        client_id: clientId,
        assigned_by: userId,
      })
      .select()
      .single();

    if (error) {
      logError(error, { route: 'POST /api/tribe-os/programs/[id]/members', id, clientId, gymId });
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'already_assigned' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: 'assign_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/programs/[id]/members' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const { id } = await params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const memberId = typeof b.member_id === 'string' ? b.member_id.trim() : '';
    if (!memberId) {
      return NextResponse.json({ success: false, error: 'missing_member_id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tribe_os_program_members')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('program_id', id)
      .is('removed_at', null)
      .select()
      .single();

    if (error) {
      logError(error, { route: 'PATCH /api/tribe-os/programs/[id]/members', id, memberId, gymId });
      return NextResponse.json({ success: false, error: 'remove_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'PATCH /api/tribe-os/programs/[id]/members' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
