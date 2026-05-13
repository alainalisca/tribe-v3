/**
 * /api/tribe-os/teams
 *   GET  — list teams in the caller's gym (with aggregated stats)
 *   POST — create a new team (owner-only)
 *
 * Reads route through list_teams_for_gym RPC which gates on
 * gym_coaches membership. Writes go through the RLS-protected
 * gym_teams table (owner-only INSERT policy).
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { listTeamsForGym, createTeam } from '@/lib/dal/gymTeams';
import { CreateTeamInputSchema } from '@/lib/validations/teams';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success) {
      return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
    }
    if (!gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }

    const result = await listTeamsForGym(supabase, gymRes.data.id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'list_failed' }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      data: { gym: { id: gymRes.data.id, name: gymRes.data.name }, teams: result.data ?? [] },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/teams' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = CreateTeamInputSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success) {
      return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
    }
    if (!gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    if (gymRes.data.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    const result = await createTeam(supabase, {
      gymId: gymRes.data.id,
      name: parsed.name,
      description: parsed.description ?? null,
      color: parsed.color,
      coachUserId: parsed.coach_user_id ?? null,
    });
    if (!result.success) {
      // Likely a duplicate name (unique constraint). Surface a 400.
      const isUnique = result.error?.toLowerCase().includes('unique') || result.error?.includes('duplicate');
      return NextResponse.json(
        { success: false, error: isUnique ? 'duplicate_name' : (result.error ?? 'create_failed') },
        { status: isUnique ? 400 : 500 }
      );
    }
    return NextResponse.json({ success: true, data: result.data }, { status: 201 });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/teams' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
