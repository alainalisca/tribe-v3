import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { ORGANIZATION_TYPES } from '@/lib/dal/gymVenue';

/**
 * Data access for the digital pass. SERVICE-ROLE ONLY.
 *
 * partner_lead_routing is unreachable by anon and authenticated (migration
 * 172), and pass_leads gives anon INSERT with no SELECT (173). Every function
 * here therefore expects the client from getServiceRoleClient(); handing it an
 * SSR or browser client fails with 42501 rather than returning partial data.
 */

export interface PassConfig {
  partnerId: string;
  slug: string;
  partnerName: string;
  /**
   * What the partner IS, so the pass page can draw the right shape (T-GYM1:
   * organizations are squares, people are circles).
   *
   * Carried as the raw column rather than a precomputed boolean so the page
   * decides with the same vocabulary every other surface uses. The CHECK on
   * featured_partners.business_type also permits 'academy' and 'club', which
   * ORGANIZATION_TYPES does not list -- so both fall to the circle today. That
   * gap is inherited deliberately: it is wrong in exactly one place if it is
   * wrong, rather than differently wrong here than on /instructors.
   */
  businessType: string | null;
  address: string | null;
  logoUrl: string | null;
  storefrontUserId: string | null;
  headline: string | null;
  sub: string | null;
  options: Record<string, string[]>;
  leadWhatsapp: string | null;
  leadEmail: string;
  leadCc: string[];
}

/** Explicit columns, never select('*') -- CONVENTIONS, and it keeps new columns out by default. */
const PASS_CONFIG_COLUMNS =
  'id, slug, business_name, business_type, address, logo_url, user_id, pass_headline, pass_sub, pass_options, pass_active, lead_whatsapp, partner_lead_routing!inner(lead_email, lead_cc)';

interface RoutingRow {
  lead_email: string;
  lead_cc: string[] | null;
}

/**
 * The one lookup the pass page and the route both use.
 *
 * ONE QUERY, INNER JOIN ON THE ROUTING ROW. A partner with pass_active true
 * and no routing row is not servable -- the form would collect a stranger's
 * phone number and have nowhere to send it -- so "no destination" and "no
 * pass" are the same answer, and !inner makes the database say so rather than
 * a second round trip and a second branch.
 *
 * Returns null for every unservable case. The CALLER MUST NOT distinguish them
 * to the client: which of "no such partner", "pass switched off" and "not
 * configured yet" applies is not a stranger's business, and telling them
 * enumerates our partner list.
 */
export async function fetchPassConfig(supabase: SupabaseClient, slug: string): Promise<PassConfig | null> {
  const { data, error } = await supabase
    .from('featured_partners')
    .select(PASS_CONFIG_COLUMNS)
    .eq('slug', slug)
    .eq('pass_active', true)
    .maybeSingle();

  if (error) {
    logError(error, { action: 'fetchPassConfig', slug });
    return null;
  }
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;

  // PostgREST returns an embedded to-one as an object, but as an array when it
  // cannot prove the relationship is to-one. partner_lead_routing's PK is its
  // FK so it is genuinely to-one; both shapes are handled because the
  // difference is a PostgREST inference detail, not a data one.
  const embedded = row.partner_lead_routing;
  const routing = (Array.isArray(embedded) ? embedded[0] : embedded) as RoutingRow | undefined;
  if (!routing?.lead_email) return null;

  return {
    partnerId: String(row.id),
    slug: String(row.slug),
    partnerName: String(row.business_name ?? ''),
    businessType: (row.business_type as string) ?? null,
    address: (row.address as string) ?? null,
    logoUrl: (row.logo_url as string) ?? null,
    storefrontUserId: (row.user_id as string) ?? null,
    headline: (row.pass_headline as string) ?? null,
    sub: (row.pass_sub as string) ?? null,
    options: normalizeOptions(row.pass_options),
    leadWhatsapp: (row.lead_whatsapp as string) ?? null,
    leadEmail: routing.lead_email,
    leadCc: routing.lead_cc ?? [],
  };
}

/**
 * Is this partner an organization rather than a person?
 *
 * The one place the pass page's avatar shape is decided. Imported from
 * gymVenue rather than redeclared: a second copy of the organization list is
 * the defect CLAUDE.md records under SPORTS_LIST, where five independent
 * declarations of one vocabulary drifted until an instructor could not tag his
 * own sport.
 */
export function isOrganizationPartner(config: Pick<PassConfig, 'businessType'>): boolean {
  return (ORGANIZATION_TYPES as readonly string[]).includes(config.businessType ?? '');
}

/**
 * pass_options is operator-entered JSON, so it is shaped here rather than
 * trusted. Anything that is not {label: string[]} is dropped: a malformed
 * group must not render a broken form or, worse, let an arbitrary value pass
 * the choice validation.
 */
function normalizeOptions(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [label, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(values)) continue;
    const clean = values.filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (clean.length > 0) out[label] = clean;
  }
  return out;
}

export interface NewPassLead {
  slug: string;
  partner_id: string;
  name: string;
  whatsapp: string;
  email: string;
  choice_1: string | null;
  choice_2: string | null;
  src: string | null;
  code: string | null;
  pass_code: string;
  consent_text: string;
  user_agent: string | null;
}

export type InsertResult =
  | { ok: true; id: string; passCode: string }
  | { ok: false; reason: 'duplicate_code' | 'error' };

/**
 * Insert one lead. `duplicate_code` is a RETRYABLE answer, not a failure: the
 * caller generates a fresh pass_code and calls again. 23505 is Postgres's
 * unique violation.
 */
export async function insertPassLead(supabase: SupabaseClient, lead: NewPassLead): Promise<InsertResult> {
  const { data, error } = await supabase.from('pass_leads').insert(lead).select('id').single();

  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'duplicate_code' };
    logError(error, { action: 'insertPassLead', slug: lead.slug });
    return { ok: false, reason: 'error' };
  }
  return { ok: true, id: String(data.id), passCode: lead.pass_code };
}

/**
 * Stamp notified_at once the partner email has actually gone out.
 *
 * Deliberately separate from the insert. A row with notified_at NULL and a
 * pass_code set is the signal that a lead survived an email failure and needs
 * chasing by hand; writing it optimistically at insert time would erase the
 * only evidence that anything went wrong.
 */
export async function markPassLeadNotified(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('pass_leads').update({ notified_at: new Date().toISOString() }).eq('id', id);
  if (error) logError(error, { action: 'markPassLeadNotified', passLeadId: id });
}
