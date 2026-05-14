/**
 * DAL: dashboard intelligence rollups (at-risk + active streakers).
 *
 * Extracted from lib/dal/clients.ts during the Phase 2 refactor.
 * Re-exported from clients.ts so existing imports stay green.
 *
 * Both functions are read-only roll-ups over the clients table,
 * scoped by the same gym/instructor tenant context the rest of the
 * DAL uses. The functions return rows shaped for direct rendering
 * by the dashboard widgets (AtRiskClient, ActiveStreaker) — those
 * shapes are the API of this module.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { ClientStatus, ClientTenantContext } from './clients';

// ------------------------------------------------------------------
// At-risk roster query (Week 2 Mission 5)
// ------------------------------------------------------------------

/** A client flagged as at-risk by the dashboard widget. */
export interface AtRiskClient {
  id: string;
  name: string;
  email: string | null;
  /**
   * Phone (raw, as entered). The widget uses this to build a WhatsApp
   * deep-link for one-click follow-up; nullable because not every
   * client record has a phone on file.
   */
  phone: string | null;
  status: ClientStatus;
  last_seen_at: string | null;
  /**
   * Days since last_seen_at, computed by the DAL. Null when
   * last_seen_at is null (the client has never been marked attended).
   */
  days_since_last_seen: number | null;
}

export interface ListAtRiskClientsOptions {
  /**
   * Threshold in days. A client with status='active' and last_seen_at
   * older than this many days counts as at-risk. Defaults to 14.
   */
  thresholdDays?: number;
  /** Max rows to return. Defaults to 25. */
  limit?: number;
  /**
   * Filter to members of one team only. Multi-team gyms (Morning
   * Crew, Evening Crew, Competition Squad) use this to scope the
   * widget per coach's responsibility. When omitted, returns
   * everyone in the gym/instructor scope regardless of team
   * membership — preserves the original behavior.
   */
  teamId?: string;
}

/**
 * Lists clients who appear to have stopped showing up. Used by the
 * `/os/dashboard` at-risk widget. Three categories qualify:
 *
 *   1. status = 'active' AND last_seen_at older than thresholdDays.
 *      The instructor hasn't manually marked them as inactive or
 *      lapsed yet, but the data says they have stopped.
 *   2. status = 'lapsed' (regardless of last_seen_at). Manual
 *      override — the instructor knows they have stopped.
 *   3. status = 'active' AND last_seen_at IS NULL AND the client was
 *      created more than thresholdDays ago. Onboarded but never
 *      attended — likely a stalled lead.
 *
 * Inactive and lead clients are NOT flagged: inactive is the
 * instructor's explicit "stopped, not at-risk" signal, and lead is
 * "not started yet" which is fine.
 *
 * Returned ordered by oldest last_seen_at first (most urgent), then by
 * created_at (oldest onboarding) for the never-attended set.
 */
export async function listAtRiskClients(
  supabase: SupabaseClient,
  context: ClientTenantContext | string,
  options: ListAtRiskClientsOptions = {}
): Promise<DalResult<AtRiskClient[]>> {
  const ctx: ClientTenantContext = typeof context === 'string' ? { gymId: null, instructorUserId: context } : context;
  const instructorUserId = ctx.instructorUserId;
  const gymId = ctx.gymId;

  const thresholdDays = Math.max(1, Math.floor(options.thresholdDays ?? 14));
  const limit = Math.max(1, Math.min(options.limit ?? 25, 100));

  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - thresholdDays);
    const cutoffIso = cutoff.toISOString();

    // When a team filter is in play, INNER-JOIN through
    // gym_team_members so PostgREST acts as a filter that drops
    // any client without a matching team membership. The selected
    // shape `team_membership:gym_team_members!inner(team_id)`
    // lets us subsequently `.eq('team_membership.team_id', teamId)`
    // to scope the join. Without a team filter we use the plain
    // SELECT — no extra cost on the common path.
    const baseSelect = options.teamId
      ? 'id, name, email, phone, status, health_status, churn_risk_score, last_seen_at, created_at, team_membership:gym_team_members!inner(team_id)'
      : 'id, name, email, phone, status, health_status, churn_risk_score, last_seen_at, created_at';

    let q = supabase.from('clients').select(baseSelect).eq('archived', false);

    if (gymId) {
      q = q.eq('gym_id', gymId);
    } else {
      q = q.eq('instructor_user_id', instructorUserId);
    }

    if (options.teamId) {
      q = q.eq('team_membership.team_id', options.teamId);
    }

    // FOUR OR branches now that the AI scoring populates
    // health_status:
    //   1. health_status = 'AT_RISK' (AI flagged them) — primary path
    //   2. status = 'lapsed' (instructor manual override)
    //   3. status = 'active' AND stale last_seen
    //   4. status = 'active' AND last_seen IS NULL AND created early enough
    // Inactive members are intentionally excluded — that's a
    // "stopped on purpose" state.
    q = q.or(
      `health_status.eq.AT_RISK,status.eq.lapsed,and(status.eq.active,last_seen_at.lt.${cutoffIso}),and(status.eq.active,last_seen_at.is.null,created_at.lt.${cutoffIso})`
    );

    // Order: AI-scored AT_RISK first (highest churn_risk_score),
    // then oldest last_seen, then oldest created.
    q = q
      .order('churn_risk_score', { ascending: false, nullsFirst: false })
      .order('last_seen_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    q = q.limit(limit);

    const { data, error } = await q;
    if (error) {
      logError(error, { action: 'listAtRiskClients', instructorUserId, gymId });
      return { success: false, error: error.message };
    }

    // The dynamic select string defeats PostgREST's static parser
    // when teamId is set (it can't statically know the join shape).
    // Double-cast through unknown to take responsibility for the row
    // shape ourselves — the AS contract is still enforced by the
    // explicit interface below.
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      status: ClientStatus;
      health_status: 'HEALTHY' | 'WATCH' | 'AT_RISK' | null;
      churn_risk_score: number | null;
      last_seen_at: string | null;
      created_at: string;
    }>;

    const now = Date.now();
    const out: AtRiskClient[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      last_seen_at: r.last_seen_at,
      days_since_last_seen: r.last_seen_at
        ? Math.floor((now - new Date(r.last_seen_at).getTime()) / (24 * 60 * 60 * 1000))
        : null,
    }));

    return { success: true, data: out };
  } catch (error) {
    logError(error, { action: 'listAtRiskClients', instructorUserId, gymId });
    return { success: false, error: 'Failed to list at-risk clients' };
  }
}

// ------------------------------------------------------------------
// Active-streakers roll-up ("Celebrate these wins" dashboard widget)
// ------------------------------------------------------------------

/**
 * A client currently on a meaningful active streak. Surfaced on the
 * /os/dashboard "Celebrate these wins" widget so the coach can fire
 * a personal congratulations via WhatsApp — the mirror image of the
 * at-risk widget, which surfaces members slipping away.
 */
export interface ActiveStreaker {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  current_streak_days: number;
  longest_streak_days: number;
  last_seen_at: string | null;
}

export interface ListActiveStreakersOptions {
  /**
   * Minimum streak in days to qualify. Defaults to 7 — a "Week
   * strong" milestone is the floor for a "this is worth
   * celebrating" moment. Coaches praising every 3-day streak
   * turns into noise; 7+ is the meaningful threshold.
   */
  minStreakDays?: number;
  /**
   * Stale-streak guard. If a client's `current_streak_days` says 10
   * but their `last_seen_at` is 14 days ago, the cached counter has
   * drifted (typically because the nightly streak-decay job hasn't
   * run yet). We exclude streakers whose last_seen_at is older than
   * this many days. Defaults to 7 — "still actively training."
   */
  staleAfterDays?: number;
  /** Max rows. Defaults to 10 — the widget renders cards, more than ~10 overflows. */
  limit?: number;
  /**
   * Filter to members of one team only. Mirrors ListAtRiskClientsOptions.teamId —
   * multi-team gyms scope the celebrate-wins widget per coach's
   * responsibility.
   */
  teamId?: string;
}

const DEFAULT_MIN_STREAK_DAYS = 7;
const DEFAULT_STALE_AFTER_DAYS = 7;
const DEFAULT_STREAKERS_LIMIT = 10;

/**
 * Lists clients currently on an active streak of `minStreakDays` or
 * more, ordered by `current_streak_days` DESC. The longest active
 * streakers show first — coaches see "Carlos is on day 47" before
 * "Ana is on day 7" so the most impressive wins get acknowledged.
 *
 * Stale-streak guard: filters out clients whose `last_seen_at` is
 * older than `staleAfterDays`. The counter trigger from migration
 * 079 keeps these accurate on every write, but if the database is
 * in an inconsistent state (rare) we don't want to celebrate a
 * streak that's actually broken.
 *
 * Archived clients are excluded. Status doesn't matter — a 'lead'
 * client who's been showing up every day deserves the praise as
 * much as an 'active' one.
 */
export async function listActiveStreakers(
  supabase: SupabaseClient,
  context: ClientTenantContext | string,
  options: ListActiveStreakersOptions = {}
): Promise<DalResult<ActiveStreaker[]>> {
  const ctx: ClientTenantContext = typeof context === 'string' ? { gymId: null, instructorUserId: context } : context;
  const instructorUserId = ctx.instructorUserId;
  const gymId = ctx.gymId;

  const minStreakDays = Math.max(1, Math.floor(options.minStreakDays ?? DEFAULT_MIN_STREAK_DAYS));
  const staleAfterDays = Math.max(1, Math.floor(options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS));
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_STREAKERS_LIMIT, 50));

  try {
    const staleCutoffIso = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000).toISOString();

    // Team filter via INNER JOIN through gym_team_members. Same
    // pattern as listAtRiskClients — see the comment there.
    const baseSelect = options.teamId
      ? 'id, name, email, phone, current_streak_days, longest_streak_days, last_seen_at, team_membership:gym_team_members!inner(team_id)'
      : 'id, name, email, phone, current_streak_days, longest_streak_days, last_seen_at';

    let q = supabase
      .from('clients')
      .select(baseSelect)
      .eq('archived', false)
      .gte('current_streak_days', minStreakDays)
      // last_seen_at must exist AND be recent enough. PostgREST's
      // gte filter implicitly excludes nulls, so the not-null guard
      // is redundant but kept explicit for clarity.
      .not('last_seen_at', 'is', null)
      .gte('last_seen_at', staleCutoffIso)
      .order('current_streak_days', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (options.teamId) {
      q = q.eq('team_membership.team_id', options.teamId);
    }

    if (gymId) {
      q = q.eq('gym_id', gymId);
    } else {
      q = q.eq('instructor_user_id', instructorUserId);
    }

    const { data, error } = await q;
    if (error) {
      logError(error, { action: 'listActiveStreakers', instructorUserId, gymId });
      return { success: false, error: error.message };
    }

    // Same dynamic-select cast rationale as listAtRiskClients above.
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      current_streak_days: number;
      longest_streak_days: number;
      last_seen_at: string | null;
    }>;

    return { success: true, data: rows };
  } catch (error) {
    logError(error, { action: 'listActiveStreakers', instructorUserId, gymId });
    return { success: false, error: 'Failed to list active streakers' };
  }
}
