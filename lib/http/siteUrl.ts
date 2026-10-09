/**
 * THE ONE CANONICAL ORIGIN FOR EVERY LINK THIS APP GENERATES.
 *
 * T-DOMAIN1, 2026-10-09. `https://tribelatam.com` is the product's address:
 * the apex serves production directly, `www.tribelatam.com` 308-redirects to
 * it, and `tribe-v3.vercel.app` keeps serving production with NO redirect
 * because printed QR codes point at it and a printed code cannot be reissued.
 *
 * ── WHY THIS MODULE EXISTS: TWO ENV VARS, ONE OF THEM DEAD ──
 *
 * The repo read TWO variables for the same question.
 *
 *   NEXT_PUBLIC_APP_URL   six files: /s, /g, /i, /invite, lib/pase/shareCard,
 *                         lib/share — i.e. every share card, og:url, og:image,
 *                         invite link and referral link.
 *   NEXT_PUBLIC_SITE_URL  ~40 server files: cron fan-out, Stripe return URLs,
 *                         email links, the pass QR via publicOrigin().
 *
 * `NEXT_PUBLIC_APP_URL` WAS NEVER SET. Not in Production, not in Preview, not
 * in Development — measured against the Vercel project on 2026-10-09, where
 * only `NEXT_PUBLIC_SITE_URL` exists. So every one of those six files had been
 * falling through to its hardcoded `'https://tribe-v3.vercel.app'` default
 * since the day it was written, and the `|| fallback` spelling made that look
 * deliberate rather than broken. That is why share cards advertised the Vercel
 * host, and nothing anywhere reported it: the fallback is a perfectly good URL
 * that serves the right app.
 *
 * The lesson is the repo's own: a default that is always taken is not a
 * default, it is the value — and `process.env.X || 'literal'` reads as
 * "configurable" at every call site while being a constant in production.
 * ONE variable, read in ONE place, so "what is it actually set to" is a
 * question with one answer.
 *
 * ── WHY THE FALLBACK IS THE REAL DOMAIN ──
 *
 * It used to be `https://tribe.fitness` in sitemap.ts and robots.ts — a domain
 * Tribe does not own. A sitemap announcing someone else's host is worse than
 * no sitemap. If the env var is ever unset or malformed, the honest default is
 * the address that actually serves this app.
 *
 * ── LOCAL DEVELOPMENT ──
 *
 * `.env.local` sets this to the dev server's address, so links generated
 * locally point at localhost and are clickable. That is the behaviour to keep:
 * the variable is what makes a LAN test reachable from a phone (see
 * publicOrigin's header for the pass-QR incident this caused).
 */

/** The address the product is reached at. Also the fallback if nothing is set. */
export const CANONICAL_SITE_URL = 'https://tribelatam.com';

/**
 * Normalise a configured origin: must be an absolute http(s) URL, and the
 * trailing slash is dropped so `${SITE_URL}/s/${id}/` never doubles it.
 *
 * Returns null — rather than throwing — on anything unusable, so a typo in an
 * env var degrades to the canonical domain instead of taking down every page
 * that renders a link. A wrong-but-working host is recoverable; a build that
 * will not render is not.
 */
export function normalizeSiteUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The canonical origin, with no trailing slash.
 *
 * NEXT_PUBLIC_ means this is inlined at BUILD time and is readable from both
 * server and client bundles, which is what lets one constant serve
 * `generateMetadata` on the server and the share sheet in the browser.
 */
export const SITE_URL: string = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? CANONICAL_SITE_URL;

/**
 * Build an absolute app URL from a path.
 *
 * ⚠ THE TRAILING SLASH IS LOAD-BEARING AND CALLERS MUST KEEP IT.
 * `next.config.ts` sets `trailingSlash: true`, so a slash-less path
 * 308-redirects to the slashed one, and link-preview scrapers (WhatsApp,
 * iMessage) do NOT follow that 308 — a slash-less share link unfurls as a bare
 * URL with no card at all. This helper does not add one for you, because a
 * path like `/sitemap.xml` must not have it; it only joins.
 */
export function appUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
