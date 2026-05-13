/**
 * Three-bucket health classifier for a single client row.
 *
 * Mirrors the precedence ladder used by /os/members and the
 * list_teams_for_gym RPC (migration 080):
 *
 *   1. AI health_status = 'AT_RISK'                       → at_risk
 *   2. AI health_status = 'WATCH'                         → watch
 *   3. Manual status   = 'lapsed'                         → watch
 *   4. Heuristic       (active AND last_seen > 14 days)   → at_risk
 *   5. Default                                            → healthy
 *
 * Clients with status outside {'active','lapsed'} (leads, inactive,
 * archived) return `null` — they're not part of the health math.
 *
 * Keeping the classifier centralized means the team list (RPC SQL)
 * and the team detail (TS) can't drift on what "at risk" means.
 *
 * Why a separate module: this logic is referenced from both the
 * team detail page and (in spirit) the SQL function. Putting it in
 * lib/health/ instead of a UI file makes the precedence easy to
 * find next time we tweak it.
 */

export type HealthBucket = 'healthy' | 'watch' | 'at_risk';

const WATCH_DAYS_THRESHOLD = 14;

export interface HealthInput {
  status: string | null;
  health_status: string | null;
  last_seen_at: string | null;
}

export function classifyHealth(row: HealthInput): HealthBucket | null {
  // Health math only applies to active/lapsed clients. Everything
  // else is a different concern (leads = sales, inactive = churned,
  // archived = ignored entirely).
  if (row.status !== 'active' && row.status !== 'lapsed') return null;

  if (row.health_status === 'AT_RISK') return 'at_risk';
  if (row.health_status === 'WATCH') return 'watch';

  // Lapsed without an AI flag → watch (someone marked them
  // dormant manually; we're not yet sure if they're truly churning).
  if (row.status === 'lapsed') return 'watch';

  // Heuristic at-risk: active but invisible for 14+ days. The AI
  // scorer would normally catch this and write health_status, but
  // for clients who haven't been re-scored yet we apply the same
  // fallback the /os/members page does.
  const seenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : null;
  if (Number.isFinite(seenMs as number)) {
    const ageDays = Math.floor((Date.now() - (seenMs as number)) / (24 * 60 * 60 * 1000));
    if (ageDays > WATCH_DAYS_THRESHOLD) return 'at_risk';
  } else {
    // No attendance record at all on an active client: also at-risk.
    return 'at_risk';
  }

  return 'healthy';
}

export interface HealthBuckets {
  healthy: number;
  watch: number;
  at_risk: number;
}

/** Aggregate a roster into bucket counts. Nulls (excluded clients) drop out. */
export function bucketCounts(rows: HealthInput[]): HealthBuckets {
  const out: HealthBuckets = { healthy: 0, watch: 0, at_risk: 0 };
  for (const r of rows) {
    const b = classifyHealth(r);
    if (b) out[b] += 1;
  }
  return out;
}
