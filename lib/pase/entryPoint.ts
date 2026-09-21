/**
 * Where the in-app entry points to the digital pass send people, and when they
 * are allowed to appear at all (T-LEAD2).
 *
 * ONE MODULE FOR BOTH SURFACES. The storefront button and the directory card
 * pill ask the same two questions -- "does this partner have a claimable pass"
 * and "what URL does the pass live at" -- and the answers must not be allowed
 * to drift apart. A second copy of the URL shape is how one surface ends up
 * attributing its leads to the other's code, which is invisible in the product
 * and only shows up as a wrong number in the admin Llego por column weeks later.
 *
 * THE GATE IS pass_active, NOT slug. featured_partners.slug is NOT NULL with a
 * BEFORE INSERT trigger filling it (163), so every partner row has one,
 * including gyms that never set up a pass. Measured on production 2026-09-19:
 * three rows, three slugs, one pass_active. The slug check below is therefore
 * a type narrowing for the URL builder and never a business rule -- do not
 * write a test asserting that a partner with a null slug is hidden, because no
 * such row can exist to test with.
 *
 * The pass page applies its own, stricter gate: fetchPassConfig also requires
 * a partner_lead_routing row, and renders InactivePass without it. This module
 * cannot see that table (it is service-role only, 172), so a partner with
 * pass_active and no routing row would show a button leading to the inactive
 * page. That is the correct failure -- the alternative is exposing the routing
 * table to the client -- and it cannot happen without someone flipping
 * pass_active by hand without configuring a destination.
 */

/**
 * The `code` each in-app surface stamps on its leads.
 *
 * These land in pass_leads.code by way of the query string, so they must
 * satisfy migration 173's pass_leads_code_shape CHECK (^[A-Za-z0-9_-]{1,40}$)
 * and route.ts's identical sanitizeTag. Both values do; a value that did not
 * would be dropped to NULL by the route rather than rejected, and the lead
 * would arrive with no attribution at all.
 *
 * They sit alongside the printed QR's BULLBOX-01 and the pass page's own
 * return button (src=pase), which is the whole attribution story until T-QR1.
 */
export const PASS_ENTRY_CODES = {
  /** The secondary button under the partner storefront header. */
  storefront: 'APP-STOREFRONT',
  /** The pill on the gym card in the /instructors directory. */
  card: 'APP-CARD',
} as const;

export type PassEntryCode = (typeof PASS_ENTRY_CODES)[keyof typeof PASS_ENTRY_CODES];

/** The two columns a surface must have selected to decide whether to render. */
export interface PassEntryPartner {
  slug: string | null | undefined;
  pass_active: boolean | null | undefined;
}

/**
 * True when this partner has a pass a visitor can claim.
 *
 * Asks the capability question, not a name question: it reads the two columns
 * that decide, rather than checking business_type or the slug's spelling. A
 * studio, an academy or an independent trainer with pass_active gets the entry
 * point on the same terms a gym does.
 */
export function hasClaimablePass(partner: PassEntryPartner | null | undefined): boolean {
  if (!partner) return false;
  return partner.pass_active === true && typeof partner.slug === 'string' && partner.slug.length > 0;
}

/**
 * The pass URL for one partner, stamped with the surface that sent them.
 *
 * TRAILING SLASH BEFORE THE QUERY STRING, deliberately. next.config sets
 * trailingSlash: true, so /pase/bullbox?src=app answers a 308 to
 * /pase/bullbox/?src=app. The redirect preserves the query string and the page
 * would work either way, but it costs a round trip on a phone, which is the
 * one thing this feature cannot afford: PaseForm already pays this attention
 * to its own POST for the same reason.
 *
 * src is always 'app' for both surfaces. The surface itself is carried by
 * `code`, which keeps the two dimensions independent -- "did this come from
 * inside Tribe" and "from which screen" -- rather than encoding both in one
 * field and having to parse it apart in the admin view.
 */
export function passEntryUrl(slug: string, code: PassEntryCode): string {
  return `/pase/${encodeURIComponent(slug)}/?src=app&code=${code}`;
}
