export interface TouchRow {
  id: string;
  client_id: string;
  created_at: string;
}

export interface VisitRow {
  client_id: string;
  visited_at: string;
}

export type TouchOutcome =
  | { kind: 'came_back'; days: number }
  | { kind: 'waiting' }
  | { kind: 'no_response' };

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function computeTouchOutcome(
  touch: TouchRow,
  visits: VisitRow[],
  now: Date,
): TouchOutcome {
  const touchMs = new Date(touch.created_at).getTime();

  let earliestVisitAfter: number | null = null;
  for (const v of visits) {
    if (v.client_id !== touch.client_id) continue;
    const visitMs = new Date(v.visited_at).getTime();
    if (visitMs <= touchMs) continue;
    if (visitMs - touchMs > FOURTEEN_DAYS_MS) continue;
    if (earliestVisitAfter === null || visitMs < earliestVisitAfter) {
      earliestVisitAfter = visitMs;
    }
  }

  if (earliestVisitAfter !== null) {
    const days = Math.ceil((earliestVisitAfter - touchMs) / (24 * 60 * 60 * 1000));
    return { kind: 'came_back', days };
  }

  const age = now.getTime() - touchMs;
  if (age < FOURTEEN_DAYS_MS) {
    return { kind: 'waiting' };
  }

  return { kind: 'no_response' };
}

export function computeTouchOutcomes(
  touches: TouchRow[],
  visits: VisitRow[],
  now: Date,
): Map<string, TouchOutcome> {
  const byClient = new Map<string, TouchRow[]>();
  for (const t of touches) {
    const arr = byClient.get(t.client_id) ?? [];
    arr.push(t);
    byClient.set(t.client_id, arr);
  }

  const clientVisits = new Map<string, VisitRow[]>();
  for (const v of visits) {
    const arr = clientVisits.get(v.client_id) ?? [];
    arr.push(v);
    clientVisits.set(v.client_id, arr);
  }

  const results = new Map<string, TouchOutcome>();

  for (const [clientId, clientTouches] of byClient) {
    const cv = clientVisits.get(clientId) ?? [];
    const sorted = [...clientTouches].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const claimedVisits = new Set<string>();

    for (let i = sorted.length - 1; i >= 0; i--) {
      const t = sorted[i];
      const touchMs = new Date(t.created_at).getTime();

      let bestVisit: VisitRow | null = null;
      let bestMs = Infinity;

      for (const v of cv) {
        const vKey = `${v.client_id}:${v.visited_at}`;
        if (claimedVisits.has(vKey)) continue;
        const visitMs = new Date(v.visited_at).getTime();
        if (visitMs <= touchMs) continue;
        if (visitMs - touchMs > FOURTEEN_DAYS_MS) continue;
        if (visitMs < bestMs) {
          bestMs = visitMs;
          bestVisit = v;
        }
      }

      if (bestVisit) {
        const vKey = `${bestVisit.client_id}:${bestVisit.visited_at}`;
        claimedVisits.add(vKey);
        const days = Math.ceil((bestMs - touchMs) / (24 * 60 * 60 * 1000));
        results.set(t.id, { kind: 'came_back', days });
      } else {
        const age = now.getTime() - touchMs;
        results.set(t.id, age < FOURTEEN_DAYS_MS ? { kind: 'waiting' } : { kind: 'no_response' });
      }
    }
  }

  return results;
}
