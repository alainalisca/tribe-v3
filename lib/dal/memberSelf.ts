/**
 * lib/dal/memberSelf.ts
 *
 * Member-facing DAL: lets a signed-in Tribe user see their own
 * client records across the gyms they're a member of.
 *
 * Identity match: we resolve membership by email. When a coach adds
 * a client whose email matches a Tribe auth user, that user can now
 * see their own training data via /my-coach. We never let one user
 * read another's data — every read is scoped to the row whose email
 * matches `auth.users.email`, double-checked at the application
 * layer because the DB's RLS doesn't have a "members read their
 * own row" branch (the surface is owned-by-coach by design).
 *
 * Why service-role + manual email check vs. an RLS policy: an RLS
 * branch like "auth.email() = clients.email" is easy to write but
 * fragile — typos or null emails could surface rows we don't want
 * surfaced. Keeping the gating in TS lets us be explicit about each
 * field that gets exposed and lets us cap/trim free-text fields
 * (notes, health_notes) so coach-side internal annotations never
 * leak to the member side.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** A single (member, gym) record the signed-in user can see. */
export interface MyMembership {
  /** The client row id (used to fetch detail). */
  client_id: string;
  /** Owning gym. */
  gym_id: string;
  gym_name: string;
  gym_slug: string;
  /** Coach-recorded display name for this member. */
  name: string;
  /** Member status as set by the coach. */
  status: 'active' | 'inactive' | 'lead' | 'lapsed' | null;
  /** Most recent attended session (UTC ISO) — null when nothing recorded. */
  last_seen_at: string | null;
}

/** Member-side view of a single client record. */
export interface MyTrainingRecord {
  /** Public identity */
  client_id: string;
  member_name: string;
  /** Owning gym (display only — members can't switch gyms here). */
  gym_id: string;
  gym_name: string;
  gym_slug: string;
  /** Cached counters (kept fresh by the attendance trigger from migration 079). */
  total_sessions: number;
  sessions_last_30_days: number;
  current_streak_days: number;
  longest_streak_days: number;
  /** Most recent attended_at (UTC ISO). Null when no attendance recorded. */
  last_seen_at: string | null;
  /** Member's training partners in this gym, capped at MAX_PARTNERS, sorted by shared_sessions DESC. */
  partners: Array<{
    partner_id: string;
    partner_name: string;
    shared_sessions: number;
    last_shared_at: string;
  }>;
  /** Most recent attendance rows for this member, capped at MAX_ATTENDANCE, newest first. */
  recent_attendance: Array<{
    id: string;
    attended_at: string | null;
    created_at: string;
    attended: boolean;
    session_title: string | null;
    session_sport: string | null;
    session_date: string | null;
    session_start_time: string | null;
  }>;
  /**
   * Sessions the gym owner created for today (gym-local time), with a
   * per-row flag indicating whether this member has already been
   * marked attended. Powers the "I'm here" self check-in UI on /my-coach.
   *
   * Capped at MAX_TODAY_SESSIONS — a gym with absurdly many sessions
   * in one day would still render cleanly. Sorted by start_time ASC.
   */
  today_sessions: Array<{
    session_id: string;
    title: string | null;
    sport: string | null;
    start_time: string | null;
    duration_minutes: number | null;
    already_checked_in: boolean;
  }>;
}

const MAX_PARTNERS = 5;
const MAX_ATTENDANCE = 10;
const MAX_TODAY_SESSIONS = 8;

/**
 * Compute "today" as a YYYY-MM-DD string in the given IANA timezone.
 * Uses Intl.DateTimeFormat with the en-CA locale because it emits the
 * ISO date format natively, avoiding manual zero-padding. Falls back
 * to UTC if the timezone string is invalid.
 */
function todayInTimezone(timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // en-CA emits "2025-04-08" directly — perfect for DATE columns.
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * List every client record the signed-in user can claim by email
 * match. Returns one entry per (gym, client) pair — a person who
 * belongs to two gyms gets two entries.
 *
 * Normalizes the email to lowercase for the match because Supabase
 * Auth stores emails lowercased while coaches may have entered the
 * client's email with mixed case.
 */
export async function listMyMemberships(userEmail: string): Promise<DalResult<MyMembership[]>> {
  const service = buildServiceClient();
  if (!service) return { success: false, error: 'service_role_missing' };
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized) return { success: true, data: [] };

  try {
    // Two-hop: clients filtered by email + non-archived, joined to
    // gyms for the display name + slug. We require gym_id IS NOT
    // NULL because the legacy path (instructor-only, no gym) doesn't
    // have a tenant view we can surface to the member.
    const { data, error } = await service
      .from('clients')
      .select(
        `
          id, gym_id, name, status, last_seen_at, archived,
          gym:gyms(id, name, slug)
        `
      )
      .ilike('email', normalized)
      .eq('archived', false)
      .not('gym_id', 'is', null);
    if (error) {
      logError(error, { action: 'listMyMemberships' });
      return { success: false, error: error.message };
    }

    const rows = (data ?? [])
      .map((row) => {
        const gym = row.gym as unknown as { id: string; name: string; slug: string } | null;
        if (!gym) return null;
        return {
          client_id: row.id as string,
          gym_id: row.gym_id as string,
          gym_name: gym.name,
          gym_slug: gym.slug,
          name: row.name as string,
          status: (row.status as MyMembership['status']) ?? null,
          last_seen_at: (row.last_seen_at as string | null) ?? null,
        };
      })
      .filter((r): r is MyMembership => r !== null)
      // Stable order: most recently active gym first. Falls back to
      // gym name for users with no attendance recorded anywhere.
      .sort((a, b) => {
        const aSeen = a.last_seen_at ?? '';
        const bSeen = b.last_seen_at ?? '';
        if (aSeen !== bSeen) return bSeen.localeCompare(aSeen);
        return a.gym_name.localeCompare(b.gym_name);
      });

    return { success: true, data: rows };
  } catch (error) {
    logError(error, { action: 'listMyMemberships.exception' });
    return { success: false, error: 'Failed to load memberships' };
  }
}

/**
 * Fetch the full member-side training record for a single client.
 * The caller MUST pass the authenticated user's email so we can
 * double-check it matches `clients.email` — this is the only thing
 * standing between "member sees their own data" and "member sees
 * someone else's data" since we're using service-role.
 */
export async function getMyTrainingRecord(
  clientId: string,
  userEmail: string
): Promise<DalResult<MyTrainingRecord | null>> {
  const service = buildServiceClient();
  if (!service) return { success: false, error: 'service_role_missing' };
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized) return { success: false, error: 'no_email' };

  try {
    // 1. Verify the client row exists, isn't archived, and the email
    //    matches the authenticated user's email. Any mismatch returns
    //    null so the API surfaces a 404 instead of leaking that the
    //    id exists for someone else.
    const { data: clientRow, error: clientErr } = await service
      .from('clients')
      .select(
        `
          id, gym_id, name, email, archived,
          total_sessions, sessions_last_30_days, current_streak_days,
          longest_streak_days, last_seen_at,
          gym:gyms(id, name, slug, owner_user_id, timezone)
        `
      )
      .eq('id', clientId)
      .maybeSingle();
    if (clientErr) {
      logError(clientErr, { action: 'getMyTrainingRecord.client', clientId });
      return { success: false, error: clientErr.message };
    }
    if (!clientRow || clientRow.archived) {
      return { success: true, data: null };
    }
    const rowEmail = ((clientRow.email as string | null) ?? '').trim().toLowerCase();
    if (rowEmail !== normalized) {
      // Identity mismatch — never expose another member's data.
      return { success: true, data: null };
    }
    const gym = clientRow.gym as unknown as {
      id: string;
      name: string;
      slug: string;
      owner_user_id: string;
      timezone: string;
    } | null;
    if (!gym) return { success: true, data: null };

    const gymToday = todayInTimezone(gym.timezone);

    // 2. Partners + recent attendance + today's sessions in parallel.
    //    All three are bounded so the total payload stays small.
    //    today_sessions powers the self check-in UI — we still want
    //    to query it even if the member has no attendance yet, so
    //    the buttons surface on day one.
    const [partnersRes, attendanceRes, todaySessionsRes] = await Promise.all([
      service
        .from('training_partners')
        .select(
          `
            member_a_id, member_b_id, shared_sessions, last_shared_at,
            client_a:clients!training_partners_member_a_id_fkey(id, name, archived),
            client_b:clients!training_partners_member_b_id_fkey(id, name, archived)
          `
        )
        .or(`member_a_id.eq.${clientId},member_b_id.eq.${clientId}`)
        .order('shared_sessions', { ascending: false })
        .limit(MAX_PARTNERS),
      service
        .from('client_attendance')
        .select(
          `
            id, attended, attended_at, created_at,
            session:sessions(id, title, sport, date, start_time)
          `
        )
        .eq('client_id', clientId)
        .order('attended_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(MAX_ATTENDANCE),
      service
        .from('sessions')
        .select('id, title, sport, start_time, duration')
        .eq('creator_id', gym.owner_user_id)
        .eq('date', gymToday)
        .eq('status', 'active')
        .order('start_time', { ascending: true })
        .limit(MAX_TODAY_SESSIONS),
    ]);

    if (partnersRes.error) {
      logError(partnersRes.error, { action: 'getMyTrainingRecord.partners', clientId });
    }
    if (attendanceRes.error) {
      logError(attendanceRes.error, { action: 'getMyTrainingRecord.attendance', clientId });
    }
    if (todaySessionsRes.error) {
      logError(todaySessionsRes.error, { action: 'getMyTrainingRecord.today_sessions', clientId });
    }

    // Resolve "already checked in" per today's session by querying
    // client_attendance for the (client, session) pairs. Single round
    // trip; the set of session ids is at most MAX_TODAY_SESSIONS.
    const todaySessionRows = todaySessionsRes.data ?? [];
    let checkedInSessionIds = new Set<string>();
    if (todaySessionRows.length > 0) {
      const sessionIds = todaySessionRows.map((r) => r.id as string);
      const { data: existing, error: existingErr } = await service
        .from('client_attendance')
        .select('session_id, attended')
        .eq('client_id', clientId)
        .in('session_id', sessionIds);
      if (existingErr) {
        logError(existingErr, { action: 'getMyTrainingRecord.today_check_state', clientId });
      } else {
        checkedInSessionIds = new Set(
          (existing ?? []).filter((r) => r.attended === true).map((r) => r.session_id as string)
        );
      }
    }

    const partners: MyTrainingRecord['partners'] = (partnersRes.data ?? [])
      .map((row) => {
        const isASide = (row.member_a_id as string) === clientId;
        const other = isASide
          ? (row.client_b as unknown as { id: string; name: string; archived: boolean } | null)
          : (row.client_a as unknown as { id: string; name: string; archived: boolean } | null);
        if (!other || other.archived) return null;
        return {
          partner_id: other.id,
          partner_name: other.name,
          shared_sessions: (row.shared_sessions as number) ?? 0,
          last_shared_at: row.last_shared_at as string,
        };
      })
      .filter((p): p is MyTrainingRecord['partners'][number] => p !== null);

    const today_sessions: MyTrainingRecord['today_sessions'] = todaySessionRows.map((row) => ({
      session_id: row.id as string,
      title: (row.title as string | null) ?? null,
      sport: (row.sport as string | null) ?? null,
      start_time: (row.start_time as string | null) ?? null,
      duration_minutes: (row.duration as number | null) ?? null,
      already_checked_in: checkedInSessionIds.has(row.id as string),
    }));

    const recent_attendance: MyTrainingRecord['recent_attendance'] = (attendanceRes.data ?? []).map((row) => {
      const session = row.session as unknown as {
        id: string;
        title: string | null;
        sport: string | null;
        date: string | null;
        start_time: string | null;
      } | null;
      return {
        id: row.id as string,
        attended_at: (row.attended_at as string | null) ?? null,
        created_at: row.created_at as string,
        attended: row.attended as boolean,
        session_title: session?.title ?? null,
        session_sport: session?.sport ?? null,
        session_date: session?.date ?? null,
        session_start_time: session?.start_time ?? null,
      };
    });

    return {
      success: true,
      data: {
        client_id: clientRow.id as string,
        member_name: clientRow.name as string,
        gym_id: gym.id,
        gym_name: gym.name,
        gym_slug: gym.slug,
        total_sessions: (clientRow.total_sessions as number) ?? 0,
        sessions_last_30_days: (clientRow.sessions_last_30_days as number) ?? 0,
        current_streak_days: (clientRow.current_streak_days as number) ?? 0,
        longest_streak_days: (clientRow.longest_streak_days as number) ?? 0,
        last_seen_at: (clientRow.last_seen_at as string | null) ?? null,
        partners,
        recent_attendance,
        today_sessions,
      },
    };
  } catch (error) {
    logError(error, { action: 'getMyTrainingRecord.exception', clientId });
    return { success: false, error: 'Failed to load training record' };
  }
}

export type SelfCheckInError =
  | 'service_role_missing'
  | 'no_email'
  | 'not_found'
  | 'identity_mismatch'
  | 'wrong_gym'
  | 'wrong_day'
  | 'archived_member'
  | 'db_error';

export interface SelfCheckInResult {
  created: boolean; // false = was already checked in (idempotent)
  session_id: string;
  client_id: string;
}

/**
 * Record a member-declared check-in for one of today's sessions.
 *
 * The contract:
 *   - Caller must be authenticated; userEmail is the auth user's
 *     verified email. The DAL re-checks it matches clients.email.
 *   - sessionId must belong to a session whose creator is the gym
 *     owner of this client's gym AND whose date == today in the gym's
 *     timezone. This is the "self check-in is for today only" rule —
 *     members can't retroactively mark sessions or pre-mark future ones.
 *   - On success, upserts the (client, session) row in client_attendance
 *     with attended=true, paid=false, attended_at=now(). The unique
 *     index on (client_id, session_id) makes the operation idempotent.
 *
 * Why service-role here: client_attendance RLS is "instructor manages
 * own clients" — the member isn't the instructor, so RLS would deny
 * them. We do the gating in TS the same way getMyTrainingRecord does
 * (email match + gym membership), with the added "today only" rule.
 */
export async function recordSelfCheckIn(
  clientId: string,
  sessionId: string,
  userEmail: string
): Promise<DalResult<SelfCheckInResult>> {
  const service = buildServiceClient();
  if (!service) return { success: false, error: 'service_role_missing' };
  const normalized = userEmail.trim().toLowerCase();
  if (!normalized) return { success: false, error: 'no_email' };

  try {
    // 1. Look up client row + gym in one hop. Need gym.owner_user_id
    //    + gym.timezone to enforce "session belongs to this gym's
    //    owner" + "session date == today in gym tz".
    const { data: clientRow, error: clientErr } = await service
      .from('clients')
      .select(
        `
          id, gym_id, email, archived,
          gym:gyms(id, owner_user_id, timezone)
        `
      )
      .eq('id', clientId)
      .maybeSingle();
    if (clientErr) {
      logError(clientErr, { action: 'recordSelfCheckIn.client', clientId, sessionId });
      return { success: false, error: 'db_error' };
    }
    if (!clientRow) return { success: false, error: 'not_found' };
    if (clientRow.archived) return { success: false, error: 'archived_member' };
    const rowEmail = ((clientRow.email as string | null) ?? '').trim().toLowerCase();
    if (rowEmail !== normalized) {
      // Same identity-mismatch guard as the read path — never let
      // one user check in as another.
      return { success: false, error: 'identity_mismatch' };
    }
    const gym = clientRow.gym as unknown as { id: string; owner_user_id: string; timezone: string } | null;
    if (!gym) return { success: false, error: 'not_found' };

    // 2. Verify the session belongs to this gym's owner AND is today.
    const { data: sessionRow, error: sessionErr } = await service
      .from('sessions')
      .select('id, creator_id, date, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionErr) {
      logError(sessionErr, { action: 'recordSelfCheckIn.session', clientId, sessionId });
      return { success: false, error: 'db_error' };
    }
    if (!sessionRow) return { success: false, error: 'not_found' };
    if (sessionRow.creator_id !== gym.owner_user_id) {
      // Session exists but isn't from this gym's owner — refuse so
      // members can't drop attendance rows on someone else's session.
      return { success: false, error: 'wrong_gym' };
    }
    const gymToday = todayInTimezone(gym.timezone);
    if (sessionRow.date !== gymToday) {
      // Self check-in is today-only. Pre-marking future sessions or
      // back-filling past ones is a coach-side action.
      return { success: false, error: 'wrong_day' };
    }

    // 3. Idempotent upsert: if this (client, session) already has an
    //    attendance row, leave it alone but bump attended=true. Common
    //    case is a coach pre-created the row with attended=false and
    //    the member is confirming via /my-coach.
    const { data: existing, error: existingErr } = await service
      .from('client_attendance')
      .select('id, attended')
      .eq('client_id', clientId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (existingErr) {
      logError(existingErr, { action: 'recordSelfCheckIn.existing', clientId, sessionId });
      return { success: false, error: 'db_error' };
    }

    if (existing) {
      if (existing.attended === true) {
        // No-op: already checked in. Idempotent — return success so
        // the UI shows the confirmed state without an error.
        return {
          success: true,
          data: { created: false, session_id: sessionId, client_id: clientId },
        };
      }
      const { error: updateErr } = await service
        .from('client_attendance')
        .update({ attended: true, attended_at: new Date().toISOString() })
        .eq('id', existing.id as string);
      if (updateErr) {
        logError(updateErr, { action: 'recordSelfCheckIn.update', clientId, sessionId });
        return { success: false, error: 'db_error' };
      }
      return {
        success: true,
        data: { created: false, session_id: sessionId, client_id: clientId },
      };
    }

    // Fresh row.
    const { error: insertErr } = await service.from('client_attendance').insert({
      client_id: clientId,
      session_id: sessionId,
      attended: true,
      paid: false,
      attended_at: new Date().toISOString(),
    });
    if (insertErr) {
      logError(insertErr, { action: 'recordSelfCheckIn.insert', clientId, sessionId });
      return { success: false, error: 'db_error' };
    }
    return {
      success: true,
      data: { created: true, session_id: sessionId, client_id: clientId },
    };
  } catch (error) {
    logError(error, { action: 'recordSelfCheckIn.exception', clientId, sessionId });
    return { success: false, error: 'db_error' };
  }
}
