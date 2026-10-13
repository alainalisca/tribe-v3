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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') as ProgramStatus | null;

    let query = supabase
      .from('tribe_os_programs')
      .select(PROGRAM_COLUMNS)
      .eq('gym_id', gymId)
      .order('updated_at', { ascending: false });

    if (status && PROGRAM_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      logError(error, { route: 'GET /api/tribe-os/programs', gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/programs' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const b = body as Record<string, unknown>;
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const description = typeof b.description === 'string' ? b.description.trim() || null : null;
    const sport = typeof b.sport === 'string' ? b.sport.trim() || null : null;
    const status = typeof b.status === 'string' ? b.status : 'draft';
    const startsAt = typeof b.starts_at === 'string' ? b.starts_at : null;
    const endsAt = typeof b.ends_at === 'string' ? b.ends_at : null;
    const target = typeof b.target_sessions_per_week === 'number' ? b.target_sessions_per_week : null;

    if (!name || name.length > PROGRAM_NAME_MAX) {
      return NextResponse.json({ success: false, error: 'invalid_name' }, { status: 400 });
    }
    if (description && description.length > PROGRAM_DESCRIPTION_MAX) {
      return NextResponse.json({ success: false, error: 'invalid_description' }, { status: 400 });
    }
    if (sport && sport.length > PROGRAM_SPORT_MAX) {
      return NextResponse.json({ success: false, error: 'invalid_sport' }, { status: 400 });
    }
    if (!PROGRAM_STATUSES.includes(status as ProgramStatus)) {
      return NextResponse.json({ success: false, error: 'invalid_status' }, { status: 400 });
    }
    if (target !== null && (target < TARGET_SESSIONS_MIN || target > TARGET_SESSIONS_MAX || !Number.isInteger(target))) {
      return NextResponse.json({ success: false, error: 'invalid_target' }, { status: 400 });
    }
    if (startsAt && endsAt && endsAt < startsAt) {
      return NextResponse.json({ success: false, error: 'invalid_dates' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tribe_os_programs')
      .insert({
        gym_id: gymId,
        name,
        description,
        sport,
        status,
        starts_at: startsAt,
        ends_at: endsAt,
        target_sessions_per_week: target,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      logError(error, { route: 'POST /api/tribe-os/programs', gymId, userId });
      return NextResponse.json({ success: false, error: 'create_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/programs' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
