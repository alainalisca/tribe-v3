/**
 * DAL: a partner reading their own pass leads (T-LEAD2 part D).
 *
 * THE BROWSER CLIENT, NOT A SERVICE-ROLE ROUTE, AND THAT IS THE SECOND OF THE
 * TICKET'S TWO READ PATHS.
 *
 * Migration 173 shipped "Partner reads own leads", a SELECT policy scoping
 * pass_leads to the rows whose partner belongs to auth.uid(). The policy is
 * already there and it already answers exactly the question this screen asks,
 * so the read runs on the caller's own client and the database decides what
 * they may see.
 *
 * The admin tab cannot do this, which is the whole reason the two paths differ:
 * its Cuenta column matches public.users.email, revoked from anon and
 * authenticated by T-SEC5, so that read has to run service-side behind
 * requireApiAdmin(). See lib/dal/adminLeads.ts. Inventing a partner-gated API
 * surface here to match it would duplicate a policy that already works.
 *
 * MEASURED, NOT ASSUMED. On production 2026-09-20, selecting pass_leads with
 * request.jwt.claims.sub set:
 *   anon, no jwt                    42501, permission denied for table pass_leads
 *   an ordinary athlete             0 rows, no error
 *   the BullBox owner               2 rows, no error
 *   a different active partner      0 rows, no error
 * The third line is the positive control. Without it the other three would be
 * equally consistent with a policy that hides the table from everybody, which
 * is a passing test that proves nothing.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** The same window the admin tab uses. One pager, one page size, one idiom. */
export const PARTNER_LEADS_PAGE_SIZE = 50;

/**
 * Explicit columns, never select('*').
 *
 * The same list the admin read takes, minus nothing: a partner sees every
 * column about their own lead that Al sees. consent_text, consent_at and
 * user_agent are absent from both for the same reason -- nothing renders them,
 * and a list screen is the wrong place to ship a paragraph of legal copy per
 * row over the wire.
 *
 * partner_id is deliberately NOT selected. The partner already knows which
 * partner they are, and it is the one column here that is purely a join key.
 */
const PARTNER_LEAD_COLUMNS =
  'id, created_at, name, whatsapp, email, choice_1, choice_2, pass_code, src, code, notified_at, contacted_at';

export interface PartnerLead {
  id: string;
  created_at: string;
  name: string;
  whatsapp: string;
  email: string;
  choice_1: string | null;
  choice_2: string | null;
  pass_code: string;
  src: string | null;
  code: string | null;
  notified_at: string | null;
  contacted_at: string | null;
}

export interface PartnerLeadTiles {
  last7: number;
  uncontacted: number;
  total: number;
}

export interface PartnerLeadsPage {
  rows: PartnerLead[];
  /** Rows this partner has, for the pager. */
  total: number;
  tiles: PartnerLeadTiles;
}

export interface PartnerLeadsQuery {
  offset?: number;
}

/**
 * One page of this partner's leads, plus their three tiles.
 *
 * THE eq() IS NOT REDUNDANT WITH THE POLICY, and it is worth saying why, because
 * it looks redundant. Two reasons, neither of them trust:
 *
 *   1. It is the predicate that makes idx_pass_leads_partner_created usable. A
 *      policy's USING clause is an EXISTS against featured_partners; an
 *      equality on the indexed leading column is not, and only one of those
 *      drives a (partner_id, created_at DESC) index scan.
 *   2. Defence in depth costs one line here. If the policy is ever loosened by
 *      a later migration, this read still asks for one partner's rows.
 *
 * The policy remains the thing that ENFORCES it. Passing another partner's id
 * returns zero rows rather than their leads, which is the negative test in
 * partnerLeads.test.ts and the probe in the module header.
 */
export async function fetchPartnerLeads(
  supabase: SupabaseClient,
  partnerId: string,
  query: PartnerLeadsQuery = {}
): Promise<DalResult<PartnerLeadsPage>> {
  // The dashboard mounts this hook before `partner` resolves, the same way the
  // venue queue does, so an empty id is an expected state and not an error.
  if (!partnerId) {
    return { success: true, data: { rows: [], total: 0, tiles: { last7: 0, uncontacted: 0, total: 0 } } };
  }

  const { offset = 0 } = query;

  try {
    const { data, error, count } = await supabase
      .from('pass_leads')
      .select(PARTNER_LEAD_COLUMNS, { count: 'exact' })
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PARTNER_LEADS_PAGE_SIZE - 1);

    if (error) return { success: false, error: error.message };

    const tiles = await fetchTiles(supabase, partnerId);
    if (!tiles.success) return { success: false, error: tiles.error };

    return {
      success: true,
      data: {
        rows: (data ?? []) as unknown as PartnerLead[],
        total: count ?? 0,
        tiles: tiles.data!,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchPartnerLeads', partnerId });
    return { success: false, error: 'Failed to fetch leads' };
  }
}

/**
 * The three tiles, scoped to this partner.
 *
 * Three head-only counts rather than one grouped select: this PostgREST has
 * aggregates disabled (select=count() returns PGRST123), the same constraint
 * fetchGymsAndStudios and the admin read both document. head:true transfers no
 * rows.
 */
async function fetchTiles(supabase: SupabaseClient, partnerId: string): Promise<DalResult<PartnerLeadTiles>> {
  const scoped = () =>
    supabase.from('pass_leads').select('id', { count: 'exact', head: true }).eq('partner_id', partnerId);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [last7, uncontacted, total] = await Promise.all([
    scoped().gte('created_at', sevenDaysAgo),
    scoped().is('contacted_at', null),
    scoped(),
  ]);

  const firstError = last7.error ?? uncontacted.error ?? total.error;
  if (firstError) return { success: false, error: firstError.message };

  return {
    success: true,
    data: { last7: last7.count ?? 0, uncontacted: uncontacted.count ?? 0, total: total.count ?? 0 },
  };
}
