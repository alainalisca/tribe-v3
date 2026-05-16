/**
 * lib/dal/recentSessions.ts
 *
 * Find sessions that ended in the last few hours — used by the
 * dashboard's "you just finished class — record attendance" prompt.
 *
 * Why a separate DAL file: lib/dal/sessions.ts is already past 700
 * lines and unrelated to the gym-tenant mental model (it serves the
 * public consumer surface too). The dashboard-prompt feature only
 * makes sense inside Tribe.OS, and the query needs gym-scoping logic
 * we don't want bleeding into the consumer DAL.
 *
 * Filter strategy:
 *   1. Pull all "active" sessions for the relevant creator(s) whose
 *      `date` is today or yesterday in UTC (yesterday covers late-
 *      night classes that started before midnight and ended after).
 *   2. Compute end-time in TS as start_time + duration. The sessions
 *      table doesn't store a real end_time column, so this is the
 *      only way; PostgREST can't do `(date + start_time + duration)`
 *      math via .gte/.lte directly.
 *   3. Keep rows where end-time is in the past AND within the window.
 *
 * Window defaults to 4 hours. Past that the coach has probably
 * already moved on; the dashboard prompt is a "right after class"
 * nudge, not a backlog tool. /os/sessions/[id]/attendance is the
 * canonical surface for catching up on older sessions.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface RecentlyEndedSession {
  id: string;
  title: string | null;
  sport: string;
  date: string;
  start_time: string;
  duration: number;
  /** Computed end timestamp (ISO) — start_time + duration. */
  ended_at_iso: string;
  /** Minutes since the session ended. Always ≥ 0 since we filter. */
  minutes_since_ended: number;
  /** Confirmed participant count from the live counter on the row. */
  current_participants: number;
}

export interface RecentlyEndedCtx {
  /** When set, scope to all coaches in this gym (multi-coach gyms). */
  gymId: string | null;
  /** Fallback when gymId is null — scope to this single instructor. */
  instructorUserId: string;
}

export interface RecentlyEndedOpts {
  /**
   * Look-back window in hours. Defaults to 4. The cap (12) keeps the
   * query bounded — anything older than half a day is stale enough
   * that the dashboard surface stops making sense.
   */
  windowHours?: number;
  /**
   * Max rows to return. Defaults to 5. Bigger gyms with multiple
   * coaches teaching back-to-back might have several recently-ended
   * sessions; we cap rather than scroll.
   */
  limit?: number;
}

const DEFAULT_WINDOW_HOURS = 4;
const MAX_WINDOW_HOURS = 12;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

/**
 * Convert (date string YYYY-MM-DD, time string HH:MM:SS) into an ISO
 * UTC timestamp. The DB stores dates as DATE and times as TIME — both
 * sans timezone — so we compose them as UTC. This matches how the
 * rest of the app reads them back; if/when we add per-gym timezones
 * this is the single spot to revisit.
 */
function composeIso(date: string, time: string): string {
  // Tolerate `HH:MM` without seconds — Postgres TIME returns either.
  const timeWithSeconds = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${timeWithSeconds}.000Z`).toISOString();
}

function yesterdayIso(now: Date): string {
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, '0')}-${String(y.getUTCDate()).padStart(2, '0')}`;
}

function todayIso(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Resolve the set of creator user ids to filter on:
 *   - gymId set → all coaches in the gym (from gym_coaches).
 *   - gymId null → just the instructorUserId.
 *
 * Kept inline rather than a separate gym-coaches helper because this
 * is the only caller that needs the bare id list (other DAL functions
 * lean on RLS instead of doing the IN-list themselves).
 */
async function resolveCreatorIds(supabase: SupabaseClient, ctx: RecentlyEndedCtx): Promise<DalResult<string[]>> {
  if (!ctx.gymId) {
    return { success: true, data: [ctx.instructorUserId] };
  }
  const { data, error } = await supabase.from('gym_coaches').select('user_id').eq('gym_id', ctx.gymId);
  if (error) {
    logError(error, { action: 'resolveCreatorIds', gymId: ctx.gymId });
    return { success: false, error: error.message };
  }
  const ids = (data ?? []).map((r) => r.user_id as string).filter(Boolean);
  // Defensive: an owner who hasn't run the backfill might not be in
  // gym_coaches yet. Always include instructorUserId so the surface
  // doesn't silently go empty.
  if (!ids.includes(ctx.instructorUserId)) ids.push(ctx.instructorUserId);
  return { success: true, data: ids };
}

/**
 * Returns sessions that ended in the look-back window, newest first.
 * Empty array when nothing qualifies — that's the dominant case
 * (most pageloads aren't right after a class), so we keep the
 * "happy empty" path cheap.
 */
export async function fetchRecentlyEndedSessions(
  supabase: SupabaseClient,
  ctx: RecentlyEndedCtx,
  opts: RecentlyEndedOpts = {}
): Promise<DalResult<RecentlyEndedSession[]>> {
  try {
    const windowHours = Math.min(Math.max(1, opts.windowHours ?? DEFAULT_WINDOW_HOURS), MAX_WINDOW_HOURS);
    const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const creatorIdsRes = await resolveCreatorIds(supabase, ctx);
    if (!creatorIdsRes.success) return { success: false, error: creatorIdsRes.error };
    const creatorIds = creatorIdsRes.data ?? [];
    if (creatorIds.length === 0) return { success: true, data: [] };

    const now = new Date();
    const cutoffMs = now.getTime() - windowHours * 60 * 60 * 1000;

    // Pull today + yesterday in UTC so we cover late-night classes
    // that crossed midnight. PostgREST .in() is cheap on a single FK
    // column with index coverage on creator_id; the day filter trims
    // to ~5-20 rows for a typical gym.
    const { data, error } = await supabase
      .from('sessions')
      .select('id, title, sport, date, start_time, duration, current_participants, status, creator_id')
      .in('creator_id', creatorIds)
      .in('date', [todayIso(now), yesterdayIso(now)])
      .eq('status', 'active')
      .order('date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error) {
      logError(error, { action: 'fetchRecentlyEndedSessions', gymId: ctx.gymId });
      return { success: false, error: error.message };
    }

    const rows = data ?? [];
    const candidates: RecentlyEndedSession[] = [];
    for (const row of rows) {
      const date = row.date as string;
      const startTime = row.start_time as string;
      const duration = Number(row.duration ?? 0);
      // Skip rows with zero/missing duration — without a duration we
      // can't compute end-time, and rendering a "just finished" CTA
      // for a session we can't bound feels wrong. Better to drop.
      if (!Number.isFinite(duration) || duration <= 0) continue;
      const startIso = composeIso(date, startTime);
      const endMs = new Date(startIso).getTime() + duration * 60 * 1000;
      // Window: ended in [cutoffMs, now]. Sessions that haven't ended
      // yet are upcoming and don't belong here.
      if (endMs > now.getTime() || endMs < cutoffMs) continue;
      candidates.push({
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        sport: row.sport as string,
        date,
        start_time: startTime,
        duration,
        ended_at_iso: new Date(endMs).toISOString(),
        minutes_since_ended: Math.floor((now.getTime() - endMs) / 60000),
        current_participants: Number(row.current_participants ?? 0),
      });
    }

    // Hide sessions that already have attendance recorded — the
    // prompt is a NUDGE, not a backlog tool, and badgering a coach
    // about a class they've already started capturing for would
    // erode trust in the surface. Single query, .in() over the
    // candidate ids. We only ask for one column to keep payload
    // tiny.
    if (candidates.length > 0) {
      const candidateIds = candidates.map((c) => c.id);
      const { data: existingAttendance, error: attendanceError } = await supabase
        .from('client_attendance')
        .select('session_id')
        .in('session_id', candidateIds);
      if (attendanceError) {
        // Don't fail the whole call on this lookup — the prompt is
        // non-critical, and a transient error here would be more
        // annoying than helpful. Log and surface everything; the
        // coach landing on the attendance page will still see what's
        // already recorded.
        logError(attendanceError, { action: 'fetchRecentlyEndedSessions.attendance_check' });
      } else {
        const recordedSessionIds = new Set((existingAttendance ?? []).map((r) => r.session_id as string));
        const filtered = candidates.filter((c) => !recordedSessionIds.has(c.id));
        return { success: true, data: filtered.slice(0, limit) };
      }
    }

    // Already ordered desc by (date, start_time) → newest-ended first
    // by construction. No re-sort needed.
    return { success: true, data: candidates.slice(0, limit) };
  } catch (error) {
    logError(error, { action: 'fetchRecentlyEndedSessions.exception' });
    return { success: false, error: 'Failed to load recently-ended sessions' };
  }
}
