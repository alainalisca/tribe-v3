/** DAL: session_participants table — join, leave, accept/decline */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type {
  DalResult,
  ParticipantWithUser,
  ParticipantWithUserDetails,
  ParticipationWithSession,
  PendingParticipantWithUser,
} from './types';
import type { SessionParticipant } from '@/lib/database.types';

// T-SEC1 Gate 3: insertParticipant / insertParticipantReturning were deleted here.
// After every join path moved onto the SECURITY DEFINER RPCs (join_session,
// join_session_as_guest, accept_waitlist_offer), these direct-insert helpers had
// zero callers, and migration 121 removes the direct-insert RLS that made them
// work at all. They are gone so nothing can accidentally reintroduce a direct
// session_participants insert that RLS now denies.

// RLS-H3: session_participants_roster flattens the users join; map its rows back
// to the nested PendingParticipantWithUser shape so callers stay unchanged.
function mapRosterRowToPending(r: unknown): PendingParticipantWithUser {
  const row = r as Record<string, unknown>;
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    session_id: row.session_id as string,
    joined_at: (row.joined_at as string | null) ?? null,
    status: row.status as string,
    user: row.user_profile_id
      ? {
          id: row.user_profile_id as string,
          name: row.user_name as string,
          avatar_url: (row.user_avatar_url as string | null) ?? null,
          preferred_language: (row.user_preferred_language as string | null) ?? null,
        }
      : null,
  };
}

export async function updateParticipantStatus(
  supabase: SupabaseClient,
  id: string,
  status: string
): Promise<DalResult<null>> {
  try {
    // BUG-206 + RLS-H3: detect a 0-row write via the affected-row COUNT, not a
    // RETURNING readback. A host approving a participant does not OWN that row, so
    // under the narrow sp_select_own policy a `.select('id')` RETURNING would fail
    // the SELECT check even on a successful UPDATE. count=exact is governed by the
    // UPDATE policy, not SELECT, so it reports the real outcome without a readback.
    const { count, error } = await supabase
      .from('session_participants')
      .update({ status }, { count: 'exact' })
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    if (!count) {
      return { success: false, error: 'No rows updated — RLS may have blocked the write' };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateParticipantStatus' });
    return { success: false, error: 'Failed to update participant' };
  }
}

export async function deleteParticipant(supabase: SupabaseClient, id: string): Promise<DalResult<null>> {
  try {
    // BUG-206 + RLS-H3: use affected-row COUNT, not a RETURNING readback — a host
    // removing another user's row cannot SELECT it back under sp_select_own.
    const { count, error } = await supabase
      .from('session_participants')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    if (!count) {
      return { success: false, error: 'No rows deleted — RLS may have blocked the write' };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteParticipant' });
    return { success: false, error: 'Failed to delete participant' };
  }
}

export async function deleteParticipantsByUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('session_participants').delete().eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteParticipantsByUser' });
    return { success: false, error: 'Failed to delete participants' };
  }
}

// RLS-H3: fetchParticipantUserIds + fetchParticipantUserIdsForSession deleted —
// both were unreferenced (dead) and read session_participants cross-user with no
// user_id=auth.uid() filter, i.e. raw reads that the narrow sp_select_own policy
// would break. Orphaned raw readers are a trap (someone rewires them and reopens
// the hole), so they are removed, same as the T-SEC1 insertParticipant helpers.

export async function fetchConfirmedParticipantsWithUsers(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<ParticipantWithUser[]>> {
  try {
    // RLS-H3: cross-user roster → owner-executed session_participants_roster view
    // (no guest PII, no token). Map the flat view rows back to the nested {user}
    // shape so callers are unchanged.
    const { data, error } = await supabase
      .from('session_participants_roster')
      .select('user_id, status, is_guest, guest_name, user_profile_id, user_name, user_avatar_url')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    const mapped = (data || []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        user_id: row.user_id,
        status: row.status,
        is_guest: row.is_guest,
        guest_name: row.guest_name,
        user: row.user_profile_id
          ? { id: row.user_profile_id, name: row.user_name, avatar_url: row.user_avatar_url }
          : null,
      };
    });
    return { success: true, data: mapped as unknown as ParticipantWithUser[] };
  } catch (error) {
    logError(error, { action: 'fetchConfirmedParticipantsWithUsers' });
    return { success: false, error: 'Failed' };
  }
}

/** Count sessions a user has joined. */
export async function fetchParticipantCountForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<number>> {
  try {
    // BUG-008 guard: same reasoning as fetchSessionsByCreatorCount. A falsy
    // userId must never reach the eq() filter or the count returns the
    // whole confirmed-participants table.
    if (!userId || userId === 'undefined' || userId === 'null') {
      return { success: true, data: 0 };
    }
    const { count, error } = await supabase
      .from('session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'fetchParticipantCountForUser' });
    return { success: false, error: 'Failed' };
  }
}

/** Get confirmed participant user IDs for a session, optionally excluding one user. */

/** Delete guest participants for a session. */
export async function deleteGuestParticipantsForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('session_participants')
      .delete()
      .eq('session_id', sessionId)
      .eq('is_guest', true);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteGuestParticipantsForSession' });
    return { success: false, error: 'Failed' };
  }
}

export async function fetchParticipationsWithSession(
  supabase: SupabaseClient,
  userId: string,
  opts?: { dateGte?: string; dateLte?: string; status?: string; userJoinFields?: string }
): Promise<DalResult<ParticipationWithSession[]>> {
  try {
    const joinFields = opts?.userJoinFields || 'session_id, sessions!inner(date, sport, duration)';
    let query = supabase.from('session_participants').select(joinFields).eq('user_id', userId);
    if (opts?.status) query = query.eq('status', opts.status);
    if (opts?.dateGte) query = query.gte('sessions.date', opts.dateGte);
    if (opts?.dateLte) query = query.lte('sessions.date', opts.dateLte);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as ParticipationWithSession[] };
  } catch (error) {
    logError(error, { action: 'fetchParticipationsWithSession' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch participants with user details (for cron session reminders). */
export async function fetchParticipantsWithUserDetails(
  supabase: SupabaseClient,
  sessionId: string,
  userFields?: string
): Promise<DalResult<ParticipantWithUserDetails[]>> {
  try {
    const fields = userFields || 'id, preferred_language, session_reminders_enabled';
    const { data, error } = await supabase
      .from('session_participants')
      .select(`user_id, user:users!session_participants_user_id_fkey(${fields})`)
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as ParticipantWithUserDetails[] };
  } catch (error) {
    logError(error, { action: 'fetchParticipantsWithUserDetails' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch sessions a user participates in (for messages page). */
export async function fetchParticipantSessionIds(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<string[]>> {
  try {
    const { data, error } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', userId)
      .eq('status', 'confirmed');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map((d) => d.session_id).filter(Boolean) };
  } catch (error) {
    logError(error, { action: 'fetchParticipantSessionIds' });
    return { success: false, error: 'Failed' };
  }
}

/** Delete a participant by session + user compound key. */
export async function deleteParticipantBySessionAndUser(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    // T-NOTIF1 + RLS-H3: affected-row COUNT surfaces a 0-row delete (RLS block or
    // no match) without a RETURNING readback. Covers self-leave (own row) AND host
    // kick (another user's row, unreadable under sp_select_own) — count is governed
    // by the DELETE policy, not SELECT.
    const { count, error } = await supabase
      .from('session_participants')
      .delete({ count: 'exact' })
      .eq('session_id', sessionId)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    if (!count) {
      return { success: false, error: 'not_removed' };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteParticipantBySessionAndUser' });
    return { success: false, error: 'Failed' };
  }
}

/** Check if a user already participates in a session. */
export async function checkExistingParticipation(
  supabase: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<DalResult<SessionParticipant | null>> {
  try {
    // RLS-H3: this checks a REGISTERED user's own participation (filtered by
    // user_id), so guest_token/guest_phone/guest_email are never relevant here and
    // are not selected — Gate 3 revokes SELECT on those columns anyway.
    const { data, error } = await supabase
      .from('session_participants')
      .select('id, session_id, user_id, status, is_guest, joined_at, guest_name')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as unknown as SessionParticipant | null };
  } catch (error) {
    logError(error, { action: 'checkExistingParticipation' });
    return { success: false, error: 'Failed' };
  }
}

/** Delete guest participants by guest token or phone. */
export async function deleteGuestParticipant(
  supabase: SupabaseClient,
  sessionId: string,
  filter: { guest_token?: string; guest_phone?: string }
): Promise<DalResult<null>> {
  try {
    let query = supabase.from('session_participants').delete().eq('session_id', sessionId).eq('is_guest', true);
    if (filter.guest_token) query = query.eq('guest_token', filter.guest_token);
    if (filter.guest_phone) query = query.eq('guest_phone', filter.guest_phone);
    const { error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteGuestParticipant' });
    return { success: false, error: 'Failed' };
  }
}

/** Check guest status by phone or email. */
export async function fetchGuestParticipant(
  supabase: SupabaseClient,
  sessionId: string,
  filter: { guest_phone?: string; guest_email?: string }
): Promise<DalResult<SessionParticipant | null>> {
  try {
    let query = supabase
      .from('session_participants')
      .select('id, session_id, user_id, status, is_guest, guest_name, guest_phone, guest_email, guest_token, joined_at')
      .eq('session_id', sessionId)
      .eq('is_guest', true);
    if (filter.guest_phone) query = query.eq('guest_phone', filter.guest_phone);
    if (filter.guest_email) query = query.eq('guest_email', filter.guest_email);
    const { data, error } = await query.maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: data as unknown as SessionParticipant | null };
  } catch (error) {
    logError(error, { action: 'fetchGuestParticipant' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch pending participants with user details for multiple sessions. */
export async function fetchPendingParticipantsForSessions(
  supabase: SupabaseClient,
  sessionIds: string[]
): Promise<DalResult<PendingParticipantWithUser[]>> {
  try {
    // RLS-H3: cross-user roster → owner-executed roster view (no guest PII/token),
    // mapped back to the nested {user} shape.
    const { data, error } = await supabase
      .from('session_participants_roster')
      .select('id, user_id, session_id, joined_at, status, user_profile_id, user_name, user_avatar_url, user_preferred_language')
      .in('session_id', sessionIds)
      .eq('status', 'pending');
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map(mapRosterRowToPending) };
  } catch (error) {
    logError(error, { action: 'fetchPendingParticipantsForSessions' });
    return { success: false, error: 'Failed' };
  }
}

/** Fetch pending join requests for a single session (for host approval panel). */
export async function fetchPendingParticipantsForSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<PendingParticipantWithUser[]>> {
  try {
    // RLS-H3: cross-user roster → owner-executed roster view (no guest PII/token).
    // T-NOTIF1: user_preferred_language so the approve/decline notification is in
    // the athlete's language. Flat view rows mapped back to the nested {user} shape.
    const { data, error } = await supabase
      .from('session_participants_roster')
      .select('id, user_id, session_id, joined_at, status, user_profile_id, user_name, user_avatar_url, user_preferred_language')
      .eq('session_id', sessionId)
      .eq('status', 'pending')
      .order('joined_at', { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []).map(mapRosterRowToPending) };
  } catch (error) {
    logError(error, { action: 'fetchPendingParticipantsForSession' });
    return { success: false, error: 'Failed' };
  }
}
