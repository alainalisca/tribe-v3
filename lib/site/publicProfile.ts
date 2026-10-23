/**
 * T-POLISH1 PR 3b-1: the pure rules behind what the public coach and gym pages
 * (/i, /g) show from the storefront. No React, no Supabase.
 */

/** Al, 2026-10-22: below this many reviews the page shows the reviews, not a star average. */
export const MIN_REVIEWS_FOR_RATING = 3;

/** How many reviews the page lists. */
export const PUBLIC_REVIEWS_SHOWN = 10;

/**
 * A reviewer on a public page: first name and last initial, never the full name
 * (Al, 2026-10-22). "María José Gómez" → "María G.", "Ana" → "Ana". A name that
 * is empty or looks like an email (an account that never set one) is the
 * fallback ("Atleta"), so an address never reaches the page.
 */
export function reviewerDisplayName(name: string | null | undefined, fallback: string): string {
  const clean = (name ?? '').trim();
  if (!clean || clean.includes('@')) return fallback;
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (parts.length === 1) return first;
  const initial = Array.from(parts[parts.length - 1])[0].toLocaleUpperCase('es');
  return `${first} ${initial}.`;
}

/** The average to show, to one decimal, or null below MIN_REVIEWS_FOR_RATING. */
export function ratingToShow(count: number, average: number): number | null {
  if (count < MIN_REVIEWS_FOR_RATING || !Number.isFinite(average)) return null;
  return Math.round(average * 10) / 10;
}

/** The attribution parameters lib/attribution.ts reads. */
export const ATTRIBUTION_PARAMS = [
  'src',
  'code',
  'ref',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
] as const;

/**
 * The free-class pass link from a public page.
 *
 * NOT ?src=app&code=… like the in-app button: the pass form submits the URL's
 * tags whole when the URL has any (lib/attribution attributionForSubmit), so a
 * fixed tag here would overwrite the poster that brought the visitor to /g or /i
 * (PR 3b-0). The page's own tags are carried over instead; with none, the plain
 * link lets the pass form fall back to the visitor's last touch.
 */
export function publicPassHref(slug: string, pageSearch: string): string {
  const base = `/pase/${encodeURIComponent(slug)}/`;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(pageSearch);
  } catch {
    return base;
  }
  const kept = new URLSearchParams();
  for (const key of ATTRIBUTION_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${base}?${query}` : base;
}

/** Where a signed-out tap goes: sign-in, then back to `path`. */
export function signInHref(path: string): string {
  return `/auth/?returnTo=${encodeURIComponent(path)}`;
}

/**
 * T-POLISH1 PR 3b-2: where an in-app link to a coach or a gym goes, now that
 * /storefront lives on the public pages (it still redirects there, for links
 * already printed or sent).
 */
export function coachPath(userId: string): string {
  return `/i/${userId}/`;
}

/**
 * A featured partner's public page: a gym or studio is /g/<slug>/ (its id when
 * it has no slug, which /g also accepts); an independent trainer is a person,
 * so /i/<their account>/ -- partners_public, which /g reads, leaves
 * independents out. null when there is nowhere to go.
 */
export function partnerPath(partner: {
  id: string;
  slug?: string | null;
  business_type?: string | null;
  user_id?: string | null;
}): string | null {
  if (partner.business_type === 'gym' || partner.business_type === 'studio') {
    return `/g/${encodeURIComponent(partner.slug || partner.id)}/`;
  }
  return partner.user_id ? coachPath(partner.user_id) : null;
}
