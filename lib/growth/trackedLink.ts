/**
 * T-GROW1 part G. Build a tracked link, and judge a code against the convention.
 *
 * Pure: no React, no DOM, no network, no `window`. The QR is rendered separately
 * and server side (lib/qr/renderQrSvg.ts is `server-only`), so this module is
 * importable from both sides and testable without either.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TRAILING SLASH IS NOT COSMETIC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * next.config sets `trailingSlash: true`, so `/pase/bullbox` answers 308 to
 * `/pase/bullbox/`. A link without it still works and spends a whole extra round
 * trip doing so -- and these links are printed on posters and scanned on gym wifi
 * by somebody standing in front of a QR code. PaseForm already pays this
 * attention to its own POST for the same reason, with the measurement recorded in
 * its comment.
 *
 * Worse than the round trip: a redirect is where a query string can be lost. The
 * whole point of the link is the query string.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PARAMETER ORDER IS FIXED, AND THAT IS FOR THE HUMAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * src, then code, then utm_campaign. Not alphabetical and not insertion order:
 * two links for the same campaign should be comparable by eye on a printed sheet,
 * and `?src=ig&code=IG-REEL-01` reading the same way every time is what makes a
 * typo visible. URLSearchParams preserves insertion order, so this is a property
 * of the order they are appended in and is asserted by the tests.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE EXISTING PRINTED URL SHAPES ARE NOT CHANGED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The programme's global rules say so explicitly: `/storefront/{uuid}/?src=&code=`
 * and `/pase/{slug}/?src=&code=` are already on printed material. This builder
 * produces exactly those shapes and adds utm_campaign as an extra parameter,
 * never a different path.
 */

import { ATTR_MAX_LEN, sanitizeTag } from '@/lib/attribution';

/** Where a tracked link can point. */
export const LINK_DESTINATIONS = ['pase', 'storefront', 'session', 'home'] as const;
export type LinkDestination = (typeof LINK_DESTINATIONS)[number];

export function isLinkDestination(value: unknown): value is LinkDestination {
  return typeof value === 'string' && (LINK_DESTINATIONS as readonly string[]).includes(value);
}

export interface TrackedLinkInput {
  destination: LinkDestination;
  /** Pass slug, storefront user id, or session id. Unused for `home`. */
  target?: string;
  src?: string;
  code?: string;
  utmCampaign?: string;
}

/**
 * The path for a destination, with its trailing slash.
 *
 * Returns null when a destination that needs a target has none, so an incomplete
 * form produces NO LINK rather than a link to the wrong place. `/pase//` would be
 * a 404 printed on a poster, and `/pase/` is the catalogue page -- which is worse,
 * because it works, so nobody would notice until the leads failed to arrive.
 */
export function destinationPath(destination: LinkDestination, target?: string): string | null {
  const t = (target ?? '').trim();
  switch (destination) {
    case 'home':
      return '/';
    case 'pase':
      // The same shape /api/pase accepts for a slug, so a link this builder emits
      // cannot point at a slug the route would reject.
      return /^[a-z0-9-]{1,80}$/.test(t.toLowerCase()) ? `/pase/${t.toLowerCase()}/` : null;
    case 'storefront':
      return isUuid(t) ? `/storefront/${t}/` : null;
    case 'session':
      return isUuid(t) ? `/session/${t}/` : null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export interface TrackedLink {
  /** Absolute, for copying and for the QR. */
  url: string;
  /** Path and query only, for showing in the form. */
  relative: string;
}

/**
 * Build the link, or null if the destination is incomplete.
 *
 * TAGS GO THROUGH sanitizeTag, THE SAME FUNCTION THE CAPTURE PATH USES. This is
 * the one place in the app that MINTS a tag rather than reading one, so it is the
 * one place that can guarantee the value a poster carries is a value the capture
 * library will accept. Minting `IG Reel 01` here would print a QR whose src is
 * silently dropped to NULL on arrival -- a poster that looks tracked and is not,
 * which is the worst outcome available to this feature.
 *
 * A tag that fails sanitising is OMITTED rather than mangled, for the same reason:
 * a parameter that is not there is visibly absent in the preview, while a
 * truncated one looks fine and is wrong.
 */
export function buildTrackedLink(origin: string, input: TrackedLinkInput): TrackedLink | null {
  const path = destinationPath(input.destination, input.target);
  if (path === null) return null;

  const params = new URLSearchParams();
  // Fixed order: src, code, utm_campaign. See the header.
  const src = sanitizeTag(input.src, 'src');
  const code = sanitizeTag(input.code, 'code');
  const campaign = sanitizeTag(input.utmCampaign, 'utm_campaign');
  if (src) params.set('src', src);
  if (code) params.set('code', code);
  if (campaign) params.set('utm_campaign', campaign);

  const query = params.toString();
  const relative = query ? `${path}?${query}` : path;
  // The origin's own trailing slash is stripped so `https://x/` + `/pase/` does
  // not become `https://x//pase/`, which some CDNs treat as a different path.
  return { url: `${origin.replace(/\/+$/, '')}${relative}`, relative };
}

/**
 * The code convention, documented in the tab: CHANNEL-DETAIL-NN.
 *
 * ADVISORY AND NOT ENFORCED, deliberately. The convention exists so a year of
 * codes can be read at a glance -- RUNCLUB-SAT0927, IG-REEL-01, EAFIT-TABLE-01,
 * BULLBOX-01 -- and a builder that REFUSED anything else would be wrong the first
 * time Al needs a code for something nobody anticipated, at which point the
 * workaround is to stop using the builder and hand-write the URL. That loses the
 * sanitising, which is the part that actually matters.
 *
 * So this returns a judgement the form can show as a hint, and the form still
 * builds the link either way.
 */
export const CODE_CONVENTION_EXAMPLE = 'RUNCLUB-SAT0927';

export interface CodeJudgement {
  /** Does it match CHANNEL-DETAIL-NN or CHANNEL-NN? */
  conventional: boolean;
  /** Will the capture library accept it at all? This one DOES matter. */
  capturable: boolean;
}

export function judgeCode(code: string): CodeJudgement {
  const trimmed = code.trim();
  const sanitized = sanitizeTag(trimmed, 'code');
  return {
    // Two to four dash-separated parts, uppercase alphanumeric, which covers
    // every example in the convention without pretending to be a grammar.
    conventional: /^[A-Z0-9]+(-[A-Z0-9]+){1,3}$/.test(trimmed.toUpperCase()) && trimmed.length <= ATTR_MAX_LEN,
    // The one that is not advisory: a code the sanitizer drops produces a poster
    // whose attribution silently never arrives.
    capturable: sanitized !== null,
  };
}
