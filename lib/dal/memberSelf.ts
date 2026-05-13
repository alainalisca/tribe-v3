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
}

const MAX_PARTNERS = 5;
const MAX_ATTENDANCE = 10;

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
          gym:gyms(id, name, slug)
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
    const gym = clientRow.gym as unknown as { id: string; name: string; slug: string } | null;
    if (!gym) return { success: true, data: null };

    // 2. Partners + recent attendance in parallel. Both are bounded
    //    so the total payload stays small (~10 rows each).
    const [partnersRes, attendanceRes] = await Promise.all([
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
    ]);

    if (partnersRes.error) {
      logError(partnersRes.error, { action: 'getMyTrainingRecord.partners', clientId });
    }
    if (attendanceRes.error) {
      logError(attendanceRes.error, { action: 'getMyTrainingRecord.attendance', clientId });
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
      },
    };
  } catch (error) {
    logError(error, { action: 'getMyTrainingRecord.exception', clientId });
    return { success: false, error: 'Failed to load training record' };
  }
}
