/**
 * lib/dal/auditWatchdog.ts
 *
 * Scans gym_audit_log for destructive-action clusters and returns
 * any triggered alerts. Companion to the audit-log infrastructure
 * (migration 082) — the log captures what happened, this evaluator
 * decides what's worth waking the gym owner up about.
 *
 * The watchdog runs on a cron (`/api/cron/tribe-os/audit-watchdog`)
 * every 6 hours. It's deliberately NOT inline with writeAuditEntry:
 * adding a count-and-alert pass to every mutation would slow every
 * destructive route and create a fan-out problem under bursty load.
 * The async cron pattern is cheaper and the lag (worst case 6h
 * before an alert fires) is acceptable for the actions we care
 * about — they're hostile, not immediate-physical-harm scenarios.
 *
 * Suppression: when an alert fires we write a `gym.alert_sent` row
 * back to the audit log with the trigger key. The next run skips
 * that key if there's a matching `gym.alert_sent` in the last 24h.
 * Prevents the watchdog from spamming the owner every 6h about the
 * same incident.
 *
 * Trigger keys are stable identifiers like
 * `client.archive:<actor_user_id>` so we de-dupe per actor per
 * action — a different coach hitting the same threshold gets a
 * separate alert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';

/**
 * Threshold definitions. Each entry says: when a single actor
 * accumulates N+ of this action in the rolling window, fire an
 * alert. Tuned conservatively — coaches doing normal cleanup work
 * shouldn't trip these.
 */
export interface ThresholdRule {
  action: string;
  /** Count threshold (>= triggers). */
  count: number;
  /** Rolling window in hours. */
  windowHours: number;
  /**
   * When true, alert on the action regardless of who did it. Used
   * for actions where ANY occurrence is worth noting (client.purge
   * is irreversible). When false (default), per-actor counting.
   */
  alertOnAny?: boolean;
}

export const AUDIT_THRESHOLDS: readonly ThresholdRule[] = [
  // 5+ archives by one coach in 24h. Normal cleanup is 1–3 a week;
  // 5 in a day from one person is either bulk roster pruning (still
  // worth knowing) or hostile (definitely worth knowing).
  { action: 'client.archive', count: 5, windowHours: 24 },
  // 10+ attendance deletions by one coach in 24h. Each deletion
  // erases revenue history; this many in a day is unusual enough
  // to surface.
  { action: 'attendance.delete', count: 10, windowHours: 24 },
  // 3+ refunds by one coach in 24h. Refunds are themselves a
  // policy choice; clusters can mean a billing error happened
  // that the owner should know about.
  { action: 'attendance.refund', count: 3, windowHours: 24 },
  // ANY purge — irreversible GDPR-style hard delete, owner-only
  // by RLS so this is essentially "did I really do that?"
  // self-notification + paper trail.
  { action: 'client.purge', count: 1, windowHours: 24, alertOnAny: true },
];

/** One triggered alert ready to be sent. */
export interface TriggeredAlert {
  gym_id: string;
  /** Stable key for suppression. e.g. "client.archive:user-uuid". */
  trigger_key: string;
  action: string;
  /** The actor responsible — null for `alertOnAny: true` rules where the actor was anonymized. */
  actor_user_id: string | null;
  count: number;
  window_hours: number;
  /** Earliest event in the window — helpful for the email body. */
  earliest_at: string;
  /** Most recent event in the window. */
  latest_at: string;
}

/**
 * Compute the cutoff timestamp for a given window in hours.
 */
function cutoffIso(windowHours: number): string {
  return new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
}

/**
 * Was an alert already sent for this trigger key in the last
 * suppressionHours? Looks for a matching `gym.alert_sent` row
 * with `payload.trigger_key === key`.
 */
async function isRecentlySuppressed(
  supabase: SupabaseClient,
  gymId: string,
  triggerKey: string,
  suppressionHours: number
): Promise<boolean> {
  const cutoff = cutoffIso(suppressionHours);
  // Use the JSON ->> operator via PostgREST: payload->>trigger_key
  // We filter both gym_id (cheap with the existing index) and
  // created_at, then check the JSON value client-side. Could push
  // the JSON match into the query with .eq('payload->>trigger_key', ...)
  // but the partial index doesn't cover it, so the client-side check
  // on a small result set is the right trade-off.
  const { data, error } = await supabase
    .from('gym_audit_log')
    .select('payload, created_at')
    .eq('gym_id', gymId)
    .eq('action', 'gym.alert_sent')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    logError(error, { action: 'auditWatchdog.suppression_check', gymId, triggerKey });
    // Fail open: if we can't read the suppression log, send the
    // alert anyway. Over-alerting is recoverable; missing a real
    // alert isn't.
    return false;
  }
  return (data ?? []).some((row) => {
    const payload = row.payload as Record<string, unknown> | null;
    return typeof payload?.trigger_key === 'string' && payload.trigger_key === triggerKey;
  });
}

/**
 * For one gym, evaluate every threshold rule and return the alerts
 * that fired. Does NOT send the emails or write suppression entries
 * — caller orchestrates those side-effects so this function stays
 * testable.
 *
 * The 24h default suppression window matches the threshold window
 * for most rules — i.e. we re-alert at most once per day per
 * trigger key.
 */
export async function evaluateGymAuditThresholds(
  supabase: SupabaseClient,
  gymId: string,
  options: { suppressionHours?: number } = {}
): Promise<TriggeredAlert[]> {
  const suppressionHours = Math.max(1, Math.floor(options.suppressionHours ?? 24));
  const triggered: TriggeredAlert[] = [];

  for (const rule of AUDIT_THRESHOLDS) {
    const cutoff = cutoffIso(rule.windowHours);
    const { data, error } = await supabase
      .from('gym_audit_log')
      .select('actor_user_id, created_at')
      .eq('gym_id', gymId)
      .eq('action', rule.action)
      .gte('created_at', cutoff);
    if (error) {
      logError(error, { action: 'auditWatchdog.threshold_query', gymId, ruleAction: rule.action });
      continue;
    }

    const rows = (data ?? []) as Array<{ actor_user_id: string | null; created_at: string }>;
    if (rows.length === 0) continue;

    if (rule.alertOnAny) {
      // Single bucket — alert when count >= threshold regardless of actor.
      if (rows.length >= rule.count) {
        const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
        const triggerKey = `${rule.action}:any`;
        const suppressed = await isRecentlySuppressed(supabase, gymId, triggerKey, suppressionHours);
        if (!suppressed) {
          triggered.push({
            gym_id: gymId,
            trigger_key: triggerKey,
            action: rule.action,
            actor_user_id: null,
            count: rows.length,
            window_hours: rule.windowHours,
            earliest_at: sorted[0].created_at,
            latest_at: sorted[sorted.length - 1].created_at,
          });
        }
      }
      continue;
    }

    // Per-actor counting.
    const byActor = new Map<string, { count: number; earliest: string; latest: string }>();
    for (const row of rows) {
      const actor = row.actor_user_id ?? '__unknown__';
      const existing = byActor.get(actor);
      if (!existing) {
        byActor.set(actor, { count: 1, earliest: row.created_at, latest: row.created_at });
      } else {
        existing.count += 1;
        if (row.created_at < existing.earliest) existing.earliest = row.created_at;
        if (row.created_at > existing.latest) existing.latest = row.created_at;
      }
    }

    for (const [actor, stats] of byActor.entries()) {
      if (stats.count < rule.count) continue;
      const triggerKey = `${rule.action}:${actor}`;
      const suppressed = await isRecentlySuppressed(supabase, gymId, triggerKey, suppressionHours);
      if (suppressed) continue;
      triggered.push({
        gym_id: gymId,
        trigger_key: triggerKey,
        action: rule.action,
        actor_user_id: actor === '__unknown__' ? null : actor,
        count: stats.count,
        window_hours: rule.windowHours,
        earliest_at: stats.earliest,
        latest_at: stats.latest,
      });
    }
  }

  if (triggered.length > 0) {
    log('info', 'audit_watchdog.triggered', {
      action: 'auditWatchdog.triggered',
      gymId,
      alert_count: triggered.length,
    });
  }

  return triggered;
}
