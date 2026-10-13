import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import {
  PROGRAM_STATUSES,
  PROGRAM_NAME_MAX,
  PROGRAM_DESCRIPTION_MAX,
  PROGRAM_SPORT_MAX,
  TARGET_SESSIONS_MIN,
  TARGET_SESSIONS_MAX,
  PROGRAM_COLUMNS,
} from '@/lib/tribe-os/programs/constants';
import type { ProgramStatus } from '@/lib/tribe-os/programs/constants';

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
      .from('tribe_os_programs')
      .select(PROGRAM_COLUMNS)
      .eq('id', id)
      .eq('gym_id', gymId)
      .single();

    if (error || !data) {
      logError(error, { route: 'GET /api/tribe-os/programs/[id]', id, gymId });
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/programs/[id]' });
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
    const update: Record<string, unknown> = {};

    if ('name' in b) {
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name || name.length > PROGRAM_NAME_MAX) {
        return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
      }
      update.name = name;
    }
    if ('description' in b) {
      const desc = typeof b.description === 'string' ? b.description.trim() || null : null;
      if (desc && desc.length > PROGRAM_DESCRIPTION_MAX) {
        return NextResponse.json({ success: false, error: 'invalid_description' }, { status: 400 });
      }
      update.description = desc;
    }
    if ('sport' in b) {
      const sport = typeof b.sport === 'string' ? b.sport.trim() || null : null;
      if (sport && sport.length > PROGRAM_SPORT_MAX) {
        return NextResponse.json({ success: false, error: 'invalid_sport' }, { status: 400 });
      }
      update.sport = sport;
    }
    if ('status' in b) {
      if (!PROGRAM_STATUSES.includes(b.status as ProgramStatus)) {
        return NextResponse.json({ success: false, error: 'invalid_status' }, { status: 400 });
      }
      update.status = b.status;
    }
    if ('starts_at' in b) {
      update.starts_at = typeof b.starts_at === 'string' ? b.starts_at : null;
    }
    if ('ends_at' in b) {
      update.ends_at = typeof b.ends_at === 'string' ? b.ends_at : null;
    }
    if ('target_sessions_per_week' in b) {
      const t = typeof b.target_sessions_per_week === 'number' ? b.target_sessions_per_week : null;
      if (t !== null && (t < TARGET_SESSIONS_MIN || t > TARGET_SESSIONS_MAX || !Number.isInteger(t))) {
        return NextResponse.json({ success: false, error: 'invalid_target' }, { status: 400 });
      }
      update.target_sessions_per_week = t;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'no_changes' }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('tribe_os_programs')
      .update(update)
      .eq('id', id)
      .eq('gym_id', gymId)
      .select()
      .single();

    if (error) {
      logError(error, { route: 'PATCH /api/tribe-os/programs/[id]', id, gymId });
      return NextResponse.json({ success: false, error: 'update_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'PATCH /api/tribe-os/programs/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
