'use client';

/**
 * State for the admin Origen tab (T-GROW1 part F).
 *
 * Reads through /api/admin/data?tab=origen, the panel's existing service-role
 * admin API behind requireApiAdmin(). It has to: migration 213 grants
 * admin_attribution_summary to service_role ALONE, so an admin's own browser
 * client cannot call it. See lib/dal/attributionSummary.ts.
 *
 * THE RANGE IS A FETCH INPUT AND THE GROUPING IS NOT. Changing the period asks
 * the database a different question; changing the grouping re-adds rows already
 * in hand, so it must not cost a round trip. That is the whole reason migration
 * 213 returns four dimensions rather than one and the collapsing lives in
 * lib/growth/originGrouping.ts -- a toggle that refetched would make the obvious
 * interaction the slow one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  groupOriginRows,
  totalOrigin,
  type OriginGrouping,
  type OriginRange,
  type OriginRow,
} from '@/lib/growth/originGrouping';
import { showError } from '@/lib/toast';
import { logError } from '@/lib/logger';

interface Messages {
  loadError: string;
}

export function useAdminOrigen(messages: Messages) {
  const [rows, setRows] = useState<OriginRow[]>([]);
  const [range, setRange] = useState<OriginRange>(30);
  const [grouping, setGrouping] = useState<OriginGrouping>('src_code');
  // Starts true so the tab shows a loading state rather than its empty state in
  // the window before the first read resolves. An empty state that is really a
  // pending state is a wrong answer, not a slow one -- and here the wrong answer
  // is "no channel has ever sent anybody".
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ tab: 'origen', days: range === null ? 'all' : String(range) });
      const res = await fetch(`/api/admin/data?${qs.toString()}`);
      if (!res.ok) throw new Error(`admin_api_${res.status}`);
      const json = (await res.json()) as { data?: OriginRow[] };
      if (!json.data) throw new Error('admin_api_empty');
      setRows(json.data);
    } catch (error) {
      // The rows already on screen stay. A failed refresh must not replace a
      // table the admin is reading with an empty state that reads as a finding.
      logError(error, { action: 'useAdminOrigen.load', range });
      showError(messages.loadError);
    } finally {
      setLoading(false);
    }
    // messages is rebuilt each render by the caller's t(); including it would
    // refetch on every render. The strings are display-only and never decide
    // what is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  // Memoised on the rows AND the grouping, so switching the toggle is one pass
  // over data already in memory rather than a refetch.
  const groups = useMemo(() => groupOriginRows(rows, grouping), [rows, grouping]);
  // From the GROUPS, never recomputed from `rows`: a total derived independently
  // can disagree with the table above it, which is the failure CLAUDE.md records
  // as a tile counting a different population from the list it sits on.
  const total = useMemo(() => totalOrigin(groups), [groups]);

  return { groups, total, range, setRange, grouping, setGrouping, loading, reload: load };
}
