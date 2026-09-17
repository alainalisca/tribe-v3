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
    const { count, error } = await supabase.from('session_participants').delete({ count: 'exact' }).eq('id', id);
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
      .select(
        'id, user_id, session_id, joined_at, status, user_profile_id, user_name, user_avatar_url, user_preferred_language'
      )
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
      .select(
        'id, user_id, session_id, joined_at, status, user_profile_id, user_name, user_avatar_url, user_preferred_language'
      )
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

// ─────────────────────────────────────────────────────────────────────────────
// T-ATH1: athlete visibility tiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How visible one athlete is to another.
 *
 *   1  a stranger -- no shared session, now or ever
 *   2  shares an UPCOMING session with the viewer
 *   3  co-attended a PAST session with the viewer
 *
 * The relation is symmetric by construction: it is derived from co-membership
 * of a session, so if A is tier 3 to B then B is tier 3 to A. Verified against
 * production -- zero asymmetric pairs across all 94 live athletes.
 */
export type VisibilityTier = 1 | 2 | 3;

/** The viewer's co-athletes, split by when they shared a session. */
export interface CoAthleteTiers {
  /** Athletes on a session the viewer is also on, dated today or later. */
  upcoming: Set<string>;
  /** Athletes the viewer shared a session with that has already passed. */
  past: Set<string>;
}

/**
 * The tier a target athlete occupies for this viewer.
 *
 * Upcoming wins over past: two people training together next week are more
 * connected than two who trained together in March, and a pair can be in both.
 */
export function tierFor(targetUserId: string, tiers: CoAthleteTiers): VisibilityTier {
  if (tiers.upcoming.has(targetUserId)) return 2;
  if (tiers.past.has(targetUserId)) return 3;
  return 1;
}

/** Local wall-clock date, matching how sessions.date is stored and compared. */
function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

interface TierRosterRow {
  user_id: string | null;
  session_id: string | null;
  sessions: { date: string | null; status: string | null; creator_id: string | null } | null;
}

/**
 * Split roster rows into the viewer's tier-2 and tier-3 co-athlete sets.
 *
 * Exported for testing: the query is one round trip and trivially mockable, but
 * the grouping is where every real decision lives, so it is asserted directly
 * rather than only through a mocked client.
 */
export function computeCoAthleteTiers(
  rows: TierRosterRow[],
  viewerId: string,
  today: string = todayIso()
): CoAthleteTiers {
  // Group first, because membership is a property of the SESSION, not of a row.
  const bySession = new Map<
    string,
    { date: string | null; status: string | null; creatorId: string | null; members: Set<string> }
  >();

  for (const row of rows) {
    if (!row.session_id || !row.sessions) continue;
    let entry = bySession.get(row.session_id);
    if (!entry) {
      entry = {
        date: row.sessions.date,
        status: row.sessions.status,
        creatorId: row.sessions.creator_id,
        members: new Set<string>(),
      };
      // The host is on the session without holding a participant row -- that is
      // the T-ATH7 convention. Without this, co-attendance with an instructor,
      // which is most of what Tribe is, would be invisible to the tiers.
      if (entry.creatorId) entry.members.add(entry.creatorId);
      bySession.set(row.session_id, entry);
    }
    // Guests have a null user_id and no profile to tier.
    if (row.user_id) entry.members.add(row.user_id);
  }

  const upcoming = new Set<string>();
  const past = new Set<string>();

  for (const entry of bySession.values()) {
    // AN APP ADMIN SEES EVERY ROSTER ROW. session_participants_roster (152)
    // grants admins full reach for moderation, so without this an admin's tier
    // map would contain the entire app and every stranger would read as tier 3.
    // The tier is about the viewer's own relationships, never their moderation
    // reach -- so drop any session the viewer is not actually on. Harmless for
    // everyone else, whose rows only ever cover their own sessions anyway.
    if (!entry.members.has(viewerId)) continue;

    // A cancelled session is not a shared plan. It still counts as shared
    // history only if it already happened.
    const isUpcoming = !!entry.date && entry.date >= today && entry.status === 'active';
    const bucket = isUpcoming ? upcoming : past;

    for (const member of entry.members) {
      if (member !== viewerId) bucket.add(member);
    }
  }

  return { upcoming, past };
}

/**
 * Every athlete the viewer shares a session with, in ONE round trip.
 *
 * HOW THIS CAN WORK AT ALL. session_participants_roster (migration 152) is
 * owner-executed and row-scoped to `is_app_admin() OR viewer-is-creator OR
 * viewer-is-a-confirmed-participant`. So an unfiltered read already returns
 * exactly the sessions the viewer is on, and every confirmed row of each --
 * which is the co-attendance set. No session id list is needed and no second
 * query: the scoping does the work.
 *
 * THE EMBED CARRIES creator_id ON PURPOSE. A host has no participant row
 * (T-ATH7), so co-attendance with the person leading the session -- most of
 * what Tribe is -- cannot be derived from participant rows alone. It is
 * disambiguated explicitly because PostgREST finds three candidate
 * relationships between this view and sessions (creator_id, verified_by, and
 * session_id) and returns PGRST201 without the hint.
 *
 * MUST RUN AS THE VIEWER. auth.uid() is NULL for service_role and server jobs,
 * which makes the view return ZERO rows -- not an error, just nothing. Call
 * this with a browser client, or a cookie-backed server client carrying the
 * user's JWT. A service-role caller gets an empty, wrong answer silently.
 */
export async function fetchCoAthleteTiers(
  supabase: SupabaseClient,
  viewerId: string
): Promise<DalResult<CoAthleteTiers>> {
  try {
    const { data, error } = await supabase
      .from('session_participants_roster')
      .select('user_id, session_id, sessions!session_participants_session_id_fkey(date, status, creator_id)')
      .eq('status', 'confirmed');

    if (error) {
      logError(error, { action: 'fetchCoAthleteTiers', viewerId });
      return { success: false, error: error.message };
    }

    return { success: true, data: computeCoAthleteTiers((data || []) as unknown as TierRosterRow[], viewerId) };
  } catch (error) {
    logError(error, { action: 'fetchCoAthleteTiers', viewerId });
    return { success: false, error: 'Failed to fetch co-athlete tiers' };
  }
}
