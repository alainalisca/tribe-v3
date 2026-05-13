/**
 * /api/tribe-os/teams/[id]/members
 *   POST   — add a client to the team (owner only)
 *   DELETE — remove a client from the team (owner only)
 *
 * Body / query:
 *   POST   { client_id: uuid }
 *   DELETE ?client_id=<uuid>
 *
 * Both the team and the client must belong to the caller's gym.
 * gym_team_members has no INSERT/DELETE policies for the authenticated
 * role — these writes go through the service-role client so RLS
 * bypass is intentional. The authorization check happens here in the
 * handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { TeamMembershipInputSchema } from '@/lib/validations/teams';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

function isUuidLike(input: string | null): input is string {
  return !!input && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verify (caller is gym owner) AND (team belongs to that gym) AND
 * (the target client belongs to that gym). Returns the resolved
 * gym_id on success or an HTTP-shaped error to surface.
 */
async function authorize(
  supabase: Parameters<typeof getGym>[0],
  userId: string,
  gymId: string | null,
  teamId: string,
  clientId: string
): Promise<{ ok: true; gymId: string } | { ok: false; status: number; error: string }> {
  const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
  if (!gymRes.success) return { ok: false, status: 500, error: 'gym_lookup_failed' };
  if (!gymRes.data) return { ok: false, status: 404, error: 'no_gym' };
  if (gymRes.data.owner_user_id !== userId) return { ok: false, status: 403, error: 'owner_only' };
  const resolvedGymId = gymRes.data.id;

  // Team belongs to this gym? gym_teams_member_select gives the
  // caller (a member) read access; we use that to verify the
  // team's gym matches.
  const { data: teamRow, error: teamErr } = await supabase
    .from('gym_teams')
    .select('id, gym_id')
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr) {
    logError(teamErr, { action: 'teams.members.team_lookup', teamId });
    return { ok: false, status: 500, error: 'team_lookup_failed' };
  }
  if (!teamRow || teamRow.gym_id !== resolvedGymId) {
    return { ok: false, status: 404, error: 'team_not_found' };
  }

  // Client belongs to this gym?
  const { data: clientRow, error: clientErr } = await supabase
    .from('clients')
    .select('id, gym_id, archived')
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) {
    logError(clientErr, { action: 'teams.members.client_lookup', clientId });
    return { ok: false, status: 500, error: 'client_lookup_failed' };
  }
  if (!clientRow || clientRow.gym_id !== resolvedGymId) {
    return { ok: false, status: 404, error: 'client_not_in_gym' };
  }
  if (clientRow.archived) {
    return { ok: false, status: 400, error: 'client_archived' };
  }

  return { ok: true, gymId: resolvedGymId };
}

export async function POST(
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
      parsed = TeamMembershipInputSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    const auth = await authorize(supabase, userId, gymId, teamId, parsed.client_id);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ success: false, error: 'server_misconfigured' }, { status: 500 });
    }

    const { error: insertErr } = await service
      .from('gym_team_members')
      .upsert({ team_id: teamId, client_id: parsed.client_id }, { onConflict: 'team_id,client_id' });
    if (insertErr) {
      logError(insertErr, { action: 'teams.members.add', teamId, clientId: parsed.client_id });
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/teams/[id]/members' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
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

    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id');
    if (!isUuidLike(clientId)) {
      return NextResponse.json({ success: false, error: 'client_id must be a UUID' }, { status: 400 });
    }

    const auth = await authorize(supabase, userId, gymId, teamId, clientId);
    if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ success: false, error: 'server_misconfigured' }, { status: 500 });
    }

    const { error: delErr, count } = await service
      .from('gym_team_members')
      .delete({ count: 'exact' })
      .eq('team_id', teamId)
      .eq('client_id', clientId);
    if (delErr) {
      logError(delErr, { action: 'teams.members.remove', teamId, clientId });
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { removed_count: count ?? 0 } });
  } catch (error) {
    logError(error, { route: 'DELETE /api/tribe-os/teams/[id]/members' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
