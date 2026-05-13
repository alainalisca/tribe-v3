/**
 * Data-access layer for gym_teams + gym_team_members.
 *
 * Reads go through the SECURITY DEFINER list_teams_for_gym RPC which
 * enforces caller membership and returns each team with aggregated
 * stats (active count, at-risk count, member-name preview). Writes
 * go through the normal table API and rely on RLS for the
 * owner-only gate on gym_teams; gym_team_members writes flow through
 * the service-role API path (the role check is done in the route
 * handler).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type TeamColor = 'lime' | 'blue' | 'amber' | 'red' | 'purple' | 'slate';

/** A team row as returned by list_teams_for_gym (with stats). */
export interface GymTeamWithStats {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  color: TeamColor;
  coach_user_id: string | null;
  coach_name: string | null;
  member_count: number;
  active_count: number;
  at_risk_count: number;
  /** Array of `{ id, name }` for the first members in the team (alphabetical). */
  preview_members: Array<{ id: string; name: string }>;
  created_at: string;
  updated_at: string;
}

/** Bare team row from gym_teams (no stats). Used for create/update. */
export interface GymTeamRow {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  color: TeamColor;
  coach_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTeamInput {
  gymId: string;
  name: string;
  description?: string | null;
  color?: TeamColor;
  coachUserId?: string | null;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string | null;
  color?: TeamColor;
  coachUserId?: string | null;
}

/**
 * List every team in the gym with member-count stats. Caller's
 * gym_coaches membership is checked inside the RPC.
 */
export async function listTeamsForGym(supabase: SupabaseClient, gymId: string): Promise<DalResult<GymTeamWithStats[]>> {
  try {
    const { data, error } = await supabase.rpc('list_teams_for_gym', { p_gym_id: gymId });
    if (error) {
      logError(error, { action: 'listTeamsForGym', gymId });
      return { success: false, error: error.message };
    }
    const rows = (data ?? []) as Array<{
      id: string;
      gym_id: string;
      name: string;
      description: string | null;
      color: TeamColor;
      coach_user_id: string | null;
      coach_name: string | null;
      member_count: number | string;
      active_count: number | string;
      at_risk_count: number | string;
      preview_members: unknown;
      created_at: string;
      updated_at: string;
    }>;
    const out: GymTeamWithStats[] = rows.map((r) => ({
      id: r.id,
      gym_id: r.gym_id,
      name: r.name,
      description: r.description,
      color: r.color,
      coach_user_id: r.coach_user_id,
      coach_name: r.coach_name,
      member_count: Number(r.member_count ?? 0),
      active_count: Number(r.active_count ?? 0),
      at_risk_count: Number(r.at_risk_count ?? 0),
      preview_members: Array.isArray(r.preview_members)
        ? (r.preview_members as Array<{ id: string; name: string }>)
        : [],
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    return { success: true, data: out };
  } catch (error) {
    logError(error, { action: 'listTeamsForGym', gymId });
    return { success: false, error: 'Failed to list teams' };
  }
}

/**
 * Create a new team. The owner-only RLS on gym_teams INSERT enforces
 * that only the gym owner can call this. The caller's authority is
 * established by Supabase auth before we get here.
 */
export async function createTeam(supabase: SupabaseClient, input: CreateTeamInput): Promise<DalResult<GymTeamRow>> {
  try {
    const { data, error } = await supabase
      .from('gym_teams')
      .insert({
        gym_id: input.gymId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? 'lime',
        coach_user_id: input.coachUserId ?? null,
      })
      .select('*')
      .single();
    if (error) {
      logError(error, { action: 'createTeam', gymId: input.gymId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as GymTeamRow };
  } catch (error) {
    logError(error, { action: 'createTeam', gymId: input.gymId });
    return { success: false, error: 'Failed to create team' };
  }
}

export async function updateTeam(
  supabase: SupabaseClient,
  teamId: string,
  patch: UpdateTeamInput
): Promise<DalResult<GymTeamRow>> {
  try {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.color !== undefined) update.color = patch.color;
    if (patch.coachUserId !== undefined) update.coach_user_id = patch.coachUserId;

    const { data, error } = await supabase.from('gym_teams').update(update).eq('id', teamId).select('*').single();
    if (error) {
      logError(error, { action: 'updateTeam', teamId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as GymTeamRow };
  } catch (error) {
    logError(error, { action: 'updateTeam', teamId });
    return { success: false, error: 'Failed to update team' };
  }
}

export async function deleteTeam(supabase: SupabaseClient, teamId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('gym_teams').delete().eq('id', teamId);
    if (error) {
      logError(error, { action: 'deleteTeam', teamId });
      return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'deleteTeam', teamId });
    return { success: false, error: 'Failed to delete team' };
  }
}

/**
 * Add a client to a team. Both must belong to the same gym; the
 * caller (a route handler with service-role) is expected to have
 * verified that.
 */
export async function addClientToTeam(
  supabase: SupabaseClient,
  teamId: string,
  clientId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('gym_team_members')
      .upsert({ team_id: teamId, client_id: clientId }, { onConflict: 'team_id,client_id' });
    if (error) {
      logError(error, { action: 'addClientToTeam', teamId, clientId });
      return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'addClientToTeam', teamId, clientId });
    return { success: false, error: 'Failed to add client to team' };
  }
}

export async function removeClientFromTeam(
  supabase: SupabaseClient,
  teamId: string,
  clientId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('gym_team_members').delete().eq('team_id', teamId).eq('client_id', clientId);
    if (error) {
      logError(error, { action: 'removeClientFromTeam', teamId, clientId });
      return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'removeClientFromTeam', teamId, clientId });
    return { success: false, error: 'Failed to remove client from team' };
  }
}
