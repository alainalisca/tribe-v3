/**
 * DAL: the admin Leads view (T-LEAD2 part B). SERVICE-ROLE ONLY.
 *
 * WHY SERVICE ROLE, when pass_leads already has an admin RLS policy.
 *
 * Migration 173 shipped "Admins manage pass leads" (FOR ALL, is_app_admin()),
 * so an admin's browser client can read these rows perfectly well. The thing it
 * cannot read is public.users.email, which T-SEC5 revoked from both anon and
 * authenticated -- measured, not assumed: has_column_privilege('authenticated',
 * 'public.users', 'email', 'SELECT') is false. The Cuenta column answers "does
 * this lead already have a Tribe account", and there is no way to ask that from
 * a client at all.
 *
 * So this runs where /api/admin/data already runs, behind requireApiAdmin(),
 * which is the same is_app_admin() gate the panel itself uses and which fails
 * closed before any data is read.
 *
 * THE PARTNER DASHBOARD DELIBERATELY DOES NOT COME THROUGH HERE. A partner is
 * not an admin, so requireApiAdmin() cannot serve them, and migration 173's
 * "Partner reads own leads" policy already scopes a partner to their own rows
 * on the browser client. Two read paths, each justified: this one exists for a
 * column no client role can select, that one exists because the policy is
 * already there and inventing a partner-gated API surface to duplicate it would
 * be the larger sin. See lib/dal/partnerLeads.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** Spec: 50 per page, newest first. */
export const ADMIN_LEADS_PAGE_SIZE = 50;

/** The sentinel the partner filter uses for "Todos". Never a partner id. */
export const ADMIN_LEADS_ALL_PARTNERS = 'all';

/**
 * Explicit columns, never select('*').
 *
 * consent_text, consent_at and user_agent are deliberately absent. They are the
 * evidence that a lead consented and they belong in the row, but nothing in
 * this view renders them, and a list screen is the wrong place to ship a
 * paragraph of legal copy per row over the wire.
 */
const LEAD_COLUMNS =
  'id, created_at, partner_id, name, whatsapp, email, choice_1, choice_2, pass_code, src, code, notified_at, contacted_at';

export interface AdminLead {
  id: string;
  created_at: string;
  partner_id: string | null;
  /** featured_partners.business_name, or null for a lead whose partner was deleted. */
  partnerName: string | null;
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
  /** True when a live users row has this exact email, lowercased. */
  hasTribeAccount: boolean;
}

export interface AdminLeadTiles {
  last7: number;
  uncontacted: number;
  total: number;
}

export interface AdminLeadsPage {
  rows: AdminLead[];
  /** Rows matching the current filter, for the pager. Not the same as tiles.total when filtered. */
  total: number;
  tiles: AdminLeadTiles;
  /** Every partner that has at least one lead, for the filter select. */
  partners: Array<{ id: string; name: string }>;
}

export interface AdminLeadsQuery {
  /** A partner id, or ADMIN_LEADS_ALL_PARTNERS. */
  partnerId?: string;
  offset?: number;
}

/**
 * One page of leads, plus the tiles and the filter's options.
 *
 * ONE CALL, NOT THREE. The tiles have to move when the Contactado toggle
 * flips, so the page would have to refetch them alongside the rows anyway.
 * Computing both in one request means they are read against one database state
 * and cannot disagree -- a table saying "contactado" next to a tile still
 * counting the row as pending is the kind of inconsistency that makes an admin
 * stop trusting the screen.
 */
export async function fetchAdminLeads(
  supabase: SupabaseClient,
  query: AdminLeadsQuery = {}
): Promise<DalResult<AdminLeadsPage>> {
  const { partnerId = ADMIN_LEADS_ALL_PARTNERS, offset = 0 } = query;
  const filtered = partnerId !== ADMIN_LEADS_ALL_PARTNERS;

  try {
    // The page itself. range() is the repo's pagination idiom (notifications,
    // comments, reviews and a dozen others); the admin panel had none to reuse.
    let rowsQuery = supabase
      .from('pass_leads')
      .select(LEAD_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + ADMIN_LEADS_PAGE_SIZE - 1);
    if (filtered) rowsQuery = rowsQuery.eq('partner_id', partnerId);

    const { data, error, count } = await rowsQuery;
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as unknown as Array<Omit<AdminLead, 'partnerName' | 'hasTribeAccount'>>;

    const [tiles, partners, names, accounts] = await Promise.all([
      fetchTiles(supabase, filtered ? partnerId : null),
      fetchPartnersWithLeads(supabase),
      fetchPartnerNames(supabase),
      fetchAccountEmails(supabase, rows),
    ]);

    if (!tiles.success) return { success: false, error: tiles.error };
    if (!partners.success) return { success: false, error: partners.error };
    if (!names.success) return { success: false, error: names.error };
    if (!accounts.success) return { success: false, error: accounts.error };

    return {
      success: true,
      data: {
        rows: rows.map((row) => ({
          ...row,
          partnerName: row.partner_id ? (names.data!.get(row.partner_id) ?? null) : null,
          hasTribeAccount: accounts.data!.has(row.email.trim().toLowerCase()),
        })),
        total: count ?? 0,
        tiles: tiles.data!,
        partners: partners
          .data!.map((id) => ({ id, name: names.data!.get(id) ?? id }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchAdminLeads' });
    return { success: false, error: 'Failed to fetch leads' };
  }
}

/**
 * The three tiles.
 *
 * THEY FOLLOW THE PARTNER FILTER. A tile reading "leads totales: 40" above a
 * table showing one partner's 6 is a number about a different population than
 * the one on screen, which is the failure CLAUDE.md records under counting
 * instructors without the gates /instructors applies. Filtered table, filtered
 * tiles, one question answered consistently.
 *
 * Three head-only counts rather than one grouped select: THIS POSTGREST HAS
 * AGGREGATES DISABLED (select=count() returns PGRST123), the same constraint
 * fetchGymsAndStudios documents. head:true transfers no rows.
 */
async function fetchTiles(supabase: SupabaseClient, partnerId: string | null): Promise<DalResult<AdminLeadTiles>> {
  const scoped = () => {
    const q = supabase.from('pass_leads').select('id', { count: 'exact', head: true });
    return partnerId ? q.eq('partner_id', partnerId) : q;
  };

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

/**
 * Which partners have leads, for the filter.
 *
 * PostgREST has no DISTINCT, so this reads one narrow column and dedupes in
 * memory. At today's volume that is two uuids. The ceiling is real and worth
 * naming: this transfers one uuid per lead row, so at tens of thousands of
 * leads it should become a view or a SECURITY DEFINER function returning the
 * distinct set. It is not worth a migration before then.
 */
async function fetchPartnersWithLeads(supabase: SupabaseClient): Promise<DalResult<string[]>> {
  const { data, error } = await supabase.from('pass_leads').select('partner_id').not('partner_id', 'is', null);
  if (error) return { success: false, error: error.message };
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const id = (row as { partner_id: string | null }).partner_id;
    if (id) ids.add(id);
  }
  return { success: true, data: [...ids] };
}

/** id -> business_name for every partner. Bounded by the partner table, which is tiny. */
async function fetchPartnerNames(supabase: SupabaseClient): Promise<DalResult<Map<string, string>>> {
  const { data, error } = await supabase.from('featured_partners').select('id, business_name');
  if (error) return { success: false, error: error.message };
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; business_name: string }>) {
    map.set(row.id, row.business_name);
  }
  return { success: true, data: map };
}

/**
 * The lowercased emails of live Tribe accounts, for the Cuenta column.
 *
 * EXACT LOWERCASE MATCH AND NOTHING ELSE. No fuzzy matching, no plus-address
 * normalisation, no name comparison: this column exists to tell Al whether a
 * lead is already a member, and a false "si" would send him into a
 * conversation with the wrong assumption about who he is talking to.
 *
 * Reads the email of every live account rather than filtering on the page's 50
 * addresses, because users_email_key indexes `email` raw and PostgREST cannot
 * express lower(email) in a filter -- an .in() on the raw values would silently
 * miss a lead who typed their address in a different case, which is the whole
 * class of miss this is meant to catch. One narrow column over 98 live accounts
 * (counted on production 2026-09-20 with deleted_at IS NULL, which is the same
 * filter the select below applies). The fix at scale is an index on
 * lower(email) plus a filtered read, and it does not belong here yet.
 */
async function fetchAccountEmails(
  supabase: SupabaseClient,
  rows: Array<{ email: string }>
): Promise<DalResult<Set<string>>> {
  // Nothing on the page means nothing to match; skip the read entirely.
  if (rows.length === 0) return { success: true, data: new Set() };

  const { data, error } = await supabase.from('users').select('email').is('deleted_at', null);
  if (error) return { success: false, error: error.message };

  const emails = new Set<string>();
  for (const row of (data ?? []) as Array<{ email: string | null }>) {
    if (row.email) emails.add(row.email.trim().toLowerCase());
  }
  return { success: true, data: emails };
}
