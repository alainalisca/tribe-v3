/**
 * Shared "contact today" filter — used by both the Retención page
 * and the briefing endpoint to guarantee identical member selection.
 *
 * Criteria:
 *   1. Retention level is 'high' or 'medium'
 *   2. 7 ≤ days_since_last_activity ≤ 30
 *   3. No touch recorded in the last 7 days
 *   4. Sorted by score descending (highest risk first)
 */

export interface ContactFilterRow {
  id: string;
  level: string | null;
  score: number | null;
  days_since_last_activity: number | null;
  last_touch: { created_at: string } | null;
}

export function filterContactToday<T extends ContactFilterRow>(members: T[]): T[] {
  return members
    .filter(
      (m) =>
        (m.level === 'high' || m.level === 'medium') &&
        m.days_since_last_activity !== null &&
        m.days_since_last_activity >= 7 &&
        m.days_since_last_activity <= 30 &&
        m.last_touch === null
    )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
