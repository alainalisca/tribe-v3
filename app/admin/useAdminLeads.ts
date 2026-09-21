'use client';

/**
 * State for the admin Leads tab (T-LEAD2 part B).
 *
 * Reads through /api/admin/data?tab=leads, which is the panel's existing
 * service-role admin API behind requireApiAdmin(). Writes go through the
 * set_pass_lead_contacted RPC on the browser client, because `authenticated`
 * has no UPDATE privilege on pass_leads at all -- see lib/dal/leadContact.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPassLeadContacted } from '@/lib/dal/leadContact';
import { ADMIN_LEADS_ALL_PARTNERS, ADMIN_LEADS_PAGE_SIZE, type AdminLeadsPage } from '@/lib/dal/adminLeads';
import { showError, showSuccess } from '@/lib/toast';
import { logError } from '@/lib/logger';

const EMPTY: AdminLeadsPage = {
  rows: [],
  total: 0,
  tiles: { last7: 0, uncontacted: 0, total: 0 },
  partners: [],
};

interface Messages {
  loadError: string;
  toggleError: string;
  markedContacted: string;
  markedPending: string;
}

export function useAdminLeads(supabase: SupabaseClient, messages: Messages) {
  const [page, setPage] = useState<AdminLeadsPage>(EMPTY);
  const [partnerId, setPartnerId] = useState<string>(ADMIN_LEADS_ALL_PARTNERS);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ tab: 'leads', partner: partnerId, offset: String(offset) });
      const res = await fetch(`/api/admin/data?${qs.toString()}`);
      if (!res.ok) throw new Error(`admin_api_${res.status}`);
      const json = (await res.json()) as { data?: AdminLeadsPage };
      if (!json.data) throw new Error('admin_api_empty');
      setPage(json.data);
    } catch (error) {
      // The list stays as it was rather than blanking: a failed refresh should
      // not take the rows the admin is already reading off the screen.
      logError(error, { action: 'useAdminLeads.load', partnerId, offset });
      showError(messages.loadError);
    } finally {
      setLoading(false);
    }
    // messages is rebuilt each render by the caller's t(); including it would
    // refetch on every render. The strings are display-only and never decide
    // what is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Changing the filter returns to page one.
   *
   * Without this, filtering to a partner with 6 leads while sitting on offset
   * 50 shows an empty table, which reads as "this partner has no leads" -- a
   * wrong answer produced by a stale pager rather than by the data.
   */
  const selectPartner = useCallback((id: string) => {
    setPartnerId(id);
    setOffset(0);
  }, []);

  const toggleContacted = useCallback(
    async (leadId: string, contacted: boolean) => {
      setTogglingId(leadId);
      try {
        const result = await setPassLeadContacted(supabase, leadId, contacted);
        if (!result.success) {
          showError(messages.toggleError);
          return;
        }
        // Render what the DATABASE returned, never the value we asked for.
        setPage((prev) => ({
          ...prev,
          rows: prev.rows.map((row) => (row.id === leadId ? { ...row, contacted_at: result.data ?? null } : row)),
          // The uncontacted tile has to move with the toggle, or the table and
          // the tile above it disagree on screen. Recomputed from the rows that
          // actually changed rather than guessed at.
          tiles: {
            ...prev.tiles,
            uncontacted: Math.max(0, prev.tiles.uncontacted + (contacted ? -1 : 1)),
          },
        }));
        showSuccess(contacted ? messages.markedContacted : messages.markedPending);
      } finally {
        setTogglingId(null);
      }
    },
    // Same reasoning as load(): messages is display-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase]
  );

  const from = page.total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + ADMIN_LEADS_PAGE_SIZE, page.total);

  return {
    page,
    partnerId,
    selectPartner,
    offset,
    from,
    to,
    hasPrev: offset > 0,
    hasNext: offset + ADMIN_LEADS_PAGE_SIZE < page.total,
    goPrev: () => setOffset((o) => Math.max(0, o - ADMIN_LEADS_PAGE_SIZE)),
    goNext: () => setOffset((o) => o + ADMIN_LEADS_PAGE_SIZE),
    loading,
    togglingId,
    toggleContacted,
    reload: load,
  };
}
