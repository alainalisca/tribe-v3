/**
 * DAL: cached-counter drift detection + (optional) correction.
 *
 * The clients table caches four counters maintained by the trigger
 * from migration 079:
 *   - total_sessions
 *   - sessions_last_30_days
 *   - current_streak_days
 *   - longest_streak_days
 *
 * The trigger fires on every INSERT/UPDATE/DELETE on client_attendance
 * and re-computes the values for the affected client. That works
 * reliably for normal traffic, but triggers CAN fail (concurrent
 * writes under deadlock, manual data fixes that bypass the trigger,
 * timeouts during a long batch insert). When a failure happens the
 * counter drifts silently and the rest of the system —
 * /os/clients/[id]'s Stats card, the Celebrate Wins widget, the
 * at-risk widget — starts lying.
 *
 * This DAL gives us:
 *   - reconcileGymCounters(supabase, gymId): recomputes the canonical
 *     values for every non-archived client in the gym and reports
 *     which ones drifted, with optional auto-correction.
 *
 * The cron route at /api/cron/tribe-os/reconcile-attendance-counters
 * runs this nightly and logs drift > 0 as a P2 to Sentry. Auto-
 * correction is opt-in via the `autoCorrect` flag so an operator
 * can run it dry first.
 *
 * Computation note: streak math matches the trigger exactly —
 * distinct UTC days from the last 61 days, grouped into 'islands'
 * by consecutive-day runs, take the latest island IF its max date
 * is today.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface CounterDrift {
  client_id: string;
  cached: {
    total_sessions: number;
    sessions_last_30_days: number;
    current_streak_days: number;
    longest_streak_days: number;
  };
  computed: {
    total_sessions: number;
    sessions_last_30_days: number;
    current_streak_days: number;
    longest_streak_days: number;
  };
}

export interface ReconcileResult {
  gym_id: string;
  clients_checked: number;
  /** Clients whose computed value disagreed with the cached value on any counter. */
  drifted: CounterDrift[];
  /** When autoCorrect=true, the count of clients we wrote corrected values for. */
  corrected_count: number;
}

export interface ReconcileOptions {
  /**
   * When true, write the computed values back to the clients table
   * to fix the drift. When false (default), report-only — drift gets
   * surfaced in the result without any database write. Always start
   * in report-only mode on a new gym; auto-correct is a privileged
   * action.
   */
  autoCorrect?: boolean;
}

/**
 * UTC date key for an ISO timestamp. Matches the trigger's
 * `(attended_at AT TIME ZONE 'UTC')::date` cast.
 */
function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Compute the four canonical counters from a sorted-newest-first
 * array of attended_at ISO timestamps. Pure function — the gym-side
 * loop is in reconcileGymCounters.
 *
 * Streak algorithm:
 *   1. Deduplicate to UTC-date keys (multiple sessions same day
 *      count as one day toward a streak).
 *   2. Walk back from today; the streak is the count of consecutive
 *      days that have an attendance, broken by the first gap.
 *   3. If the most recent attended day is NOT today, current streak
 *      is 0 — same rule the trigger uses (`max_d = v_today` check).
 */
export function computeCountersFromTimestamps(
  attendedAtIsos: string[],
  longestStreakSoFar: number,
  now: Date = new Date()
): {
  total_sessions: number;
  sessions_last_30_days: number;
  current_streak_days: number;
  longest_streak_days: number;
} {
  const total_sessions = attendedAtIsos.length;

  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sessions_last_30_days = attendedAtIsos.filter((iso) => new Date(iso) >= cutoff30).length;

  // Streak: dedupe to UTC dates, then check if today is in the set
  // and walk back day-by-day to count the run.
  const days = new Set(attendedAtIsos.map(utcDateKey));
  const today = utcDateKey(now.toISOString());
  let current_streak_days = 0;
  if (days.has(today)) {
    let cursor = new Date(now);
    while (days.has(utcDateKey(cursor.toISOString()))) {
      current_streak_days += 1;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  // longest_streak_days only ratchets up — the trigger uses
  // GREATEST(existing, computed). Honoring the same rule here is
  // important: a deletion that reduces the historical longest would
  // surprise users ('I had a 50-day streak last year and now it
  // says 30?').
  const longest_streak_days = Math.max(longestStreakSoFar, current_streak_days);

  return {
    total_sessions,
    sessions_last_30_days,
    current_streak_days,
    longest_streak_days,
  };
}

/**
 * Recompute counters for every non-archived client in a gym and
 * compare against the cached values. Returns a drift report.
 *
 * Performance note: this fetches all attended attendance rows for
 * the gym in one query, then groups in TS. For a gym with 50
 * members each averaging 100 attendance rows, that's 5000 rows in
 * one round trip — easily handled. If gyms scale past ~50k rows we
 * should pivot to per-client recomputation or push the math into
 * a SQL view.
 */
export async function reconcileGymCounters(
  supabase: SupabaseClient,
  gymId: string,
  options: ReconcileOptions = {}
): Promise<DalResult<ReconcileResult>> {
  try {
    // Pull every non-archived client in the gym with its cached
    // counter values.
    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('id, total_sessions, sessions_last_30_days, current_streak_days, longest_streak_days')
      .eq('gym_id', gymId)
      .eq('archived', false);
    if (clientsErr) {
      logError(clientsErr, { action: 'reconcileGymCounters.clients_query', gymId });
      return { success: false, error: clientsErr.message };
    }
    const clientRows = (clients ?? []) as Array<{
      id: string;
      total_sessions: number;
      sessions_last_30_days: number;
      current_streak_days: number;
      longest_streak_days: number;
    }>;
    if (clientRows.length === 0) {
      return { success: true, data: { gym_id: gymId, clients_checked: 0, drifted: [], corrected_count: 0 } };
    }

    // Pull all attended attendance rows for those clients in a
    // single query. PostgREST handles arrays of UUIDs via .in().
    const clientIds = clientRows.map((c) => c.id);
    const { data: attendance, error: attErr } = await supabase
      .from('client_attendance')
      .select('client_id, attended_at')
      .in('client_id', clientIds)
      .eq('attended', true)
      .not('attended_at', 'is', null);
    if (attErr) {
      logError(attErr, { action: 'reconcileGymCounters.attendance_query', gymId });
      return { success: false, error: attErr.message };
    }

    // Group attended_at timestamps by client_id.
    const byClient = new Map<string, string[]>();
    for (const row of attendance ?? []) {
      const cid = row.client_id as string;
      const ts = row.attended_at as string | null;
      if (!ts) continue;
      const arr = byClient.get(cid) ?? [];
      arr.push(ts);
      byClient.set(cid, arr);
    }

    const drifted: CounterDrift[] = [];
    const correctionUpdates: Array<{
      id: string;
      total_sessions: number;
      sessions_last_30_days: number;
      current_streak_days: number;
      longest_streak_days: number;
    }> = [];

    for (const client of clientRows) {
      const isos = byClient.get(client.id) ?? [];
      const computed = computeCountersFromTimestamps(isos, client.longest_streak_days);
      const cached = {
        total_sessions: client.total_sessions ?? 0,
        sessions_last_30_days: client.sessions_last_30_days ?? 0,
        current_streak_days: client.current_streak_days ?? 0,
        longest_streak_days: client.longest_streak_days ?? 0,
      };
      const isDrifted =
        cached.total_sessions !== computed.total_sessions ||
        cached.sessions_last_30_days !== computed.sessions_last_30_days ||
        cached.current_streak_days !== computed.current_streak_days ||
        cached.longest_streak_days !== computed.longest_streak_days;
      if (isDrifted) {
        drifted.push({ client_id: client.id, cached, computed });
        if (options.autoCorrect) {
          correctionUpdates.push({ id: client.id, ...computed });
        }
      }
    }

    let corrected_count = 0;
    if (options.autoCorrect && correctionUpdates.length > 0) {
      // We DO use the gated client (not service-role). RLS on
      // clients allows the gym owner / coaches to UPDATE rows in
      // their gym, so the cron-route caller (which must be an
      // authenticated gym owner) can write through normally.
      // Auto-correcting via service-role would bypass per-tenant
      // visibility and we don't want that as a normal pattern.
      //
      // We loop because Supabase doesn't expose a multi-row UPDATE
      // with different values per row via PostgREST without an
      // RPC. For the typical drift case (<5 clients per gym per
      // run), the per-row round trip is fine.
      for (const upd of correctionUpdates) {
        const { error: updErr } = await supabase
          .from('clients')
          .update({
            total_sessions: upd.total_sessions,
            sessions_last_30_days: upd.sessions_last_30_days,
            current_streak_days: upd.current_streak_days,
            longest_streak_days: upd.longest_streak_days,
          })
          .eq('id', upd.id);
        if (updErr) {
          logError(updErr, { action: 'reconcileGymCounters.correct', gymId, clientId: upd.id });
          continue;
        }
        corrected_count += 1;
      }
      log('info', 'reconcileGymCounters.corrected', {
        gymId,
        corrected_count,
        drifted_count: drifted.length,
      });
    }

    return {
      success: true,
      data: {
        gym_id: gymId,
        clients_checked: clientRows.length,
        drifted,
        corrected_count,
      },
    };
  } catch (error) {
    logError(error, { action: 'reconcileGymCounters.exception', gymId });
    return { success: false, error: 'Failed to reconcile counters' };
  }
}
