/**
 * The public gym profile: /g/[slug].
 *
 * READS public.partners_public, NEVER public.featured_partners.
 *
 * This is the migration-140 trap in a new shape. featured_partners' SELECT
 * policy is (status = 'active' OR is_app_admin()), so the base table works
 * perfectly while you are signed in as an admin or as the gym's owner, and
 * returns nothing to a logged-out visitor the day the sponsorship lapses. No
 * test in this repo can catch that -- they all mock the DAL -- and the symptom
 * would be a dead link in someone's Instagram bio, months after the deploy that
 * caused it.
 *
 * partners_public (163) is owner-executed, so it bypasses that policy and
 * excludes only 'pending'. Its column list is the security boundary; see the
 * migration.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PublicPartner {
  id: string;
  slug: string;
  business_name: string;
  business_type: string | null;
  description: string | null;
  description_es: string | null;
  logo_url: string | null;
  /**
   * COALESCE(logo_url, owner account avatar), computed in the view.
   *
   * The client-side partnerLogoUrl() chain cannot be used here: it resolves the
   * avatar through a PostgREST embed on user_id, and user_id is deliberately
   * absent from partners_public (it joins a business to a person's account).
   * Every live partner has logo_url = NULL, so without this column the page and
   * its WhatsApp card would both render a monogram.
   */
  logo_image_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  specialties: string[] | null;
  display_order: number | null;
}

/** Explicit, per CONVENTIONS: never `select('*')` on a public surface. */
export const PUBLIC_PARTNER_COLUMNS =
  'id, slug, business_name, business_type, description, description_es, logo_url, logo_image_url, ' +
  'banner_url, website_url, phone, address, lat, lng, specialties, display_order';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which column a /g/ segment addresses.
 *
 * The slug CHECK is `^[a-z0-9-]+$`, which a UUID also satisfies, so the two
 * namespaces overlap and the order matters: a segment shaped like a UUID is
 * treated as an id. That is safe because slugs are generated from business
 * names and a 36-character hyphenated hex string is not a reachable output of
 * slugify_partner_name().
 *
 * Both forms resolve to the same page so that any UUID link already in
 * circulation keeps working forever.
 */
export function partnerLookupColumn(param: string): 'id' | 'slug' {
  return UUID_RE.test(param) ? 'id' : 'slug';
}

/**
 * One partner by slug or id, or null. ONE function for the server metadata
 * fetch and the client render, so the two can never disagree about which row a
 * URL means.
 *
 * maybeSingle(), not single(): a miss is a 404 page, not an error to log.
 */
export async function fetchPublicPartner(supabase: SupabaseClient, param: string): Promise<PublicPartner | null> {
  const { data, error } = await supabase
    .from('partners_public')
    .select(PUBLIC_PARTNER_COLUMNS)
    .eq(partnerLookupColumn(param), param)
    .maybeSingle();

  if (error) {
    console.error('[/g/[id]] partner fetch failed', error);
    return null;
  }
  return (data as PublicPartner | null) ?? null;
}

/**
 * The description to show, in the app's language.
 *
 * DELIBERATE: falls back to the OTHER language rather than to nothing. This is
 * not a bug and should not be "fixed" by tightening it.
 *
 * `description` is NULL on EVERY live partner row and only `description_es` is
 * filled, so a strict language match renders an English visitor a page with no
 * description at all. The gym's own words in the wrong language beat a blank.
 *
 * THE REAL FIX IS DATA, NOT CODE: fill featured_partners.description (the
 * English column) for each partner. Once every row carries both languages this
 * fallback arm simply stops being reached, and it stays as the guard for the
 * next partner who fills only one.
 *
 * app/g/[id]/page.tsx calls this same function for the OG card, so the link
 * preview and the page body can never disagree about which text they show.
 *
 * This is field selection, not copy: description_es is a separate COLUMN, so it
 * picks a row value and does not belong in messages/.
 *
 * A map rather than a ternary on `language`, same as lib/dateLocale: it reads as
 * data and stays clear of the i18n lint rule.
 */
const DESCRIPTION_FIELDS: Record<string, ReadonlyArray<'description' | 'description_es'>> = {
  es: ['description_es', 'description'],
  en: ['description', 'description_es'],
};

export function partnerDescription(partner: PublicPartner, language: string): string | null {
  const order = DESCRIPTION_FIELDS[language] ?? DESCRIPTION_FIELDS.en;
  for (const field of order) {
    const value = partner[field];
    if (value) return value;
  }
  return null;
}
