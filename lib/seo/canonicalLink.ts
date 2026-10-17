/**
 * The rel="canonical" HTTP header every HTML page is served with.
 *
 * WHY. The site answers on two hosts with identical content:
 * tribelatam.com and tribe-v3.vercel.app. The old host cannot redirect,
 * because printed QR codes and both native apps (capacitor.config.ts
 * server.url) load from it. Without a canonical signal Google may index both
 * and split Tribe's ranking between them; measured 2026-10-12, the old host
 * served /about/ with no canonical tag and no noindex.
 *
 * HOW. middleware.ts sets `Link: <https://tribelatam.com/path/>; rel="canonical"`
 * on every successful page response, on BOTH hosts (a self-referencing
 * canonical on tribelatam.com is correct, and harmless). Google honours a
 * canonical sent as an HTTP Link header exactly as it honours the HTML tag,
 * and one header in the middleware covers every page, including the many
 * client pages that cannot export metadata.
 *
 * The URL is always CANONICAL_SITE_URL, never SITE_URL: SITE_URL follows an
 * env var, and the point here is to name tribelatam.com whatever the host or
 * the environment says.
 *
 * Paths are normalised the way next.config.ts's trailingSlash: true serves
 * them (one trailing slash), and the query string is dropped, so ?ref= or
 * ?utm_ tracking links all point at one page.
 */
import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';

/**
 * Route prefixes whose pages declare their OWN canonical in HTML metadata.
 * Each entry carries its reason (CLAUDE.md: an exemption without one cannot be
 * audited). Two canonicals that disagree are worse than none, so these routes
 * get no header. canonicalLink.test.ts fails if a page declares
 * `alternates.canonical` under a prefix NOT listed here, and if an entry here
 * no longer has such a page.
 */
export const OWN_CANONICAL_PREFIXES: Record<string, string> = {
  '/g/':
    'Partner pages resolve an id OR a slug to one partner and declare the slug URL as canonical ' +
    '(app/g/[id]/page.tsx), so /g/<uuid>/ must point at /g/<slug>/, which the request path alone cannot know.',
};

/** Never pages: API routes, Next internals, and anything with a file extension. */
function isNonPage(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') || pathname === '/api' || pathname.startsWith('/_next/') || /\.\w+$/.test(pathname)
  );
}

/** The canonical URL for a path, or null when this route must not get one. */
export function canonicalUrlFor(pathname: string): string | null {
  if (!pathname.startsWith('/') || isNonPage(pathname)) return null;
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`;
  for (const prefix of Object.keys(OWN_CANONICAL_PREFIXES)) {
    if (withSlash.startsWith(prefix)) return null;
  }
  return `${CANONICAL_SITE_URL}${withSlash}`;
}

/** The full Link header value, or null. */
export function canonicalLinkHeader(pathname: string): string | null {
  const url = canonicalUrlFor(pathname);
  return url ? `<${url}>; rel="canonical"` : null;
}
