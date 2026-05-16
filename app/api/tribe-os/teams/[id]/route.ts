/**
 * /api/tribe-os/teams/[id]
 *   GET    — fetch team + members
 *   PATCH  — update team (name / description / color / coach) — owner only
 *   DELETE — delete team (cascades to gym_team_members) — owner only
 *
 * Reads gate via RLS (gym_coaches membership). Writes gate via the
 * gym.owner_user_id check inside the handler — the gym_teams owner-
 * only INSERT/UPDATE/DELETE policies enforce the same constraint at
 * the DB level as a defense-in-depth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { deleteTeam, getTeamWithMembers, updateTeam } from '@/lib/dal/gymTeams';
import { writeAuditEntry } from '@/lib/dal/auditLog';
import { UpdateTeamInputSchema } from '@/lib/validations/teams';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

async function ensureOwner(
  supabase: Parameters<typeof getGym>[0],
  userId: string,
  gymId: string | null
): Promise<{ ok: true; gymId: string } | { ok: false; status: number; error: string }> {
  const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
  if (!gymRes.success) return { ok: false, status: 500, error: 'gym_lookup_failed' };
  if (!gymRes.data) return { ok: false, status: 404, error: 'no_gym' };
  if (gymRes.data.owner_user_id !== userId) return { ok: false, status: 403, error: 'owner_only' };
  return { ok: true, gymId: gymRes.data.id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: teamId } = await params;
    if (!teamId) {
      return NextResponse.json({ success: false, error: 'team_id_required' }, { status: 400 });
    }

    const result = await getTeamWithMembers(supabase, teamId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'fetch_failed' }, { status: 500 });
    }
    if (!result.data) {
      return NextResponse.json({ success: false, error: 'team_not_found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/teams/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const { id: teamId } = await params;
    if (!teamId) {
      return NextResponse.json({ success: false, error: 'team_id_required' }, { status: 400 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = UpdateTeamInputSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    const owner = await ensureOwner(supabase, userId, gymId);
    if (!owner.ok) return NextResponse.json({ success: false, error: owner.error }, { status: owner.status });

    const result = await updateTeam(supabase, teamId, {
      name: parsed.name,
      description: parsed.description ?? null,
      color: parsed.color,
      coachUserId: parsed.coach_user_id ?? null,
    });
    if (!result.success) {
      const isUnique = result.error?.toLowerCase().includes('unique') || result.error?.includes('duplicate');
      return NextResponse.json(
        { success: false, error: isUnique ? 'duplicate_name' : (result.error ?? 'update_failed') },
        { status: isUnique ? 400 : 500 }
      );
    }

    // Audit: log the new state. We don't snapshot the previous state
    // (would require an extra read) — the audit log shows a stream of
    // "team set to X" entries which lets a reader replay change history
    // from the sequence without each entry being a diff.
    if (result.data) {
      await writeAuditEntry(supabase, {
        gymId: owner.gymId,
        actorUserId: userId,
        action: 'team.update',
        targetType: 'team',
        targetId: result.data.id,
        payload: {
          name: result.data.name,
          color: result.data.color,
          coach_user_id: result.data.coach_user_id,
        },
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'PATCH /api/tribe-os/teams/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const { id: teamId } = await params;
    if (!teamId) {
      return NextResponse.json({ success: false, error: 'team_id_required' }, { status: 400 });
    }

    const owner = await ensureOwner(supabase, userId, gymId);
    if (!owner.ok) return NextResponse.json({ success: false, error: owner.error }, { status: owner.status });

    // Snapshot name+color BEFORE delete so the audit payload carries
    // what existed. Once delete cascades to gym_team_members there's
    // no way to reconstruct membership; we deliberately don't try to
    // log every member-id (could be 100+) — name is enough to know
    // what was removed.
    const teamSnapshot = await getTeamWithMembers(supabase, teamId);
    const snapshotName = teamSnapshot.success && teamSnapshot.data ? teamSnapshot.data.name : null;
    const snapshotMemberCount = teamSnapshot.success && teamSnapshot.data ? teamSnapshot.data.members.length : null;

    const result = await deleteTeam(supabase, teamId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'delete_failed' }, { status: 500 });
    }

    // Audit: team deletion cascades to gym_team_members. This is the
    // single most "where did everyone go?" forensic moment a non-
    // owner coach might experience, so the entry carries the
    // member_count_at_delete so they can verify nothing's lost.
    await writeAuditEntry(supabase, {
      gymId: owner.gymId,
      actorUserId: userId,
      action: 'team.delete',
      targetType: 'team',
      targetId: teamId,
      payload: {
        name: snapshotName,
        member_count_at_delete: snapshotMemberCount,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'DELETE /api/tribe-os/teams/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
