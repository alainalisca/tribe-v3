'use client';

/**
 * State for the partner dashboard's leads section (T-LEAD2 part D).
 *
 * Reads on the caller's own browser client under migration 173's "Partner
 * reads own leads" policy, so the database decides which rows exist for this
 * caller. Writes go through the set_pass_lead_contacted RPC, because
 * `authenticated` holds no UPDATE privilege on pass_leads at all -- see
 * lib/dal/leadContact.ts. That is the same function the admin tab calls; one
 * implementation, two audiences.
 *
 * Lives in hooks/ beside useVenueRequests, which is the partner dashboard's
 * other section hook, rather than next to useAdminLeads. The two screens share
 * a table component and a write path, not their state.
 */
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPassLeadContacted } from '@/lib/dal/leadContact';
import { fetchPartnerLeads, PARTNER_LEADS_PAGE_SIZE, type PartnerLeadsPage } from '@/lib/dal/partnerLeads';
import { showError, showSuccess } from '@/lib/toast';
import { logError } from '@/lib/logger';

const EMPTY: PartnerLeadsPage = { rows: [], total: 0, tiles: { last7: 0, uncontacted: 0, total: 0 } };

interface Messages {
  loadError: string;
  toggleError: string;
  markedContacted: string;
  markedPending: string;
}

interface Args {
  supabase: SupabaseClient;
  /** Empty until the dashboard resolves the partner row; the read no-ops on it. */
  partnerId: string;
  messages: Messages;
}

export function usePartnerLeads({ supabase, partnerId, messages }: Args) {
  const [page, setPage] = useState<PartnerLeadsPage>(EMPTY);
  const [offset, setOffset] = useState(0);
  // Starts true so the section shows a loading state rather than "no leads yet"
  // in the window before the partner id resolves. An empty state that is really
  // a pending state is a wrong answer, not a slow one.
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPartnerLeads(supabase, partnerId, { offset });
      if (!result.success) {
        // The rows already on screen stay: a failed refresh should not take the
        // list the partner is reading away from them.
        logError(result.error, { action: 'usePartnerLeads.load', partnerId, offset });
        showError(messages.loadError);
        return;
      }
      setPage(result.data!);
    } finally {
      setLoading(false);
    }
    // messages is rebuilt each render by the caller's t(); including it would
    // refetch on every render. The strings are display-only and never decide
    // what is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, partnerId, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleContacted = useCallback(
    async (leadId: string, contacted: boolean) => {
      setTogglingId(leadId);
      try {
        const result = await setPassLeadContacted(supabase, leadId, contacted);
        if (!result.success) {
          showError(messages.toggleError);
          return;
        }
        // Render what the DATABASE returned, never the value we asked for. The
        // function preserves an existing contacted_at on a repeat mark, so the
        // timestamp on screen is the one in the row.
        setPage((prev) => ({
          ...prev,
          rows: prev.rows.map((row) => (row.id === leadId ? { ...row, contacted_at: result.data ?? null } : row)),
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
  const to = Math.min(offset + PARTNER_LEADS_PAGE_SIZE, page.total);

  return {
    page,
    from,
    to,
    hasPrev: offset > 0,
    hasNext: offset + PARTNER_LEADS_PAGE_SIZE < page.total,
    goPrev: () => setOffset((o) => Math.max(0, o - PARTNER_LEADS_PAGE_SIZE)),
    goNext: () => setOffset((o) => o + PARTNER_LEADS_PAGE_SIZE),
    loading,
    togglingId,
    toggleContacted,
    reload: load,
  };
}
