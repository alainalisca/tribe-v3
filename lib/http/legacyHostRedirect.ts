/**
 * tribe-v3.vercel.app → tribelatam.com, for people. T-DOMAIN1 step 3.
 *
 * Every link sent before 2026-10-09, and every printed Tribe T-shirt QR code,
 * says tribe-v3.vercel.app. Those keep working because the redirect keeps the
 * path and query: /session/abc/?ref=x lands on the same page on tribelatam.com.
 * A 301, so search engines move the old URLs' standing to the new host.
 *
 * ── WHAT IS NOT REDIRECTED, AND WHY EACH ONE WOULD BREAK ──
 *
 * The native app. capacitor.config.ts loads `server.url:
 * https://tribe-v3.vercel.app`, and `allowNavigation` does not list
 * tribelatam.com. Redirecting its WebView would send every launch of the
 * installed iOS and Android apps out to the system browser, and only a store
 * release could undo that. Capacitor sets no custom user agent, so the WebView
 * is recognised by the platform's own WebView markers: Android's `; wv)`, and an
 * Apple WebKit agent with no `Safari/` token (Safari, Chrome, Firefox and Edge
 * on iOS and macOS all carry one; WKWebView does not). The same rule also skips
 * in-app browsers such as Instagram's, which is harmless: they stay on the old
 * host, which serves the same app.
 *
 * Link-preview bots. A scraper that does not follow the redirect shows no card
 * at all (lib/http/siteUrl.ts records the same for the trailing-slash 308), and
 * the page it would be redirected to has the same tags anyway: og:url already
 * names tribelatam.com. So an old link keeps its preview by being served in
 * place.
 *
 * Anything that is not a page view: non-GET/HEAD (a 301 on a POST is replayed
 * as a GET or not at all), /api (Stripe and Wompi webhooks, cron, the native
 * app's fetches), /.well-known (Apple does not follow redirects for the AASA,
 * and the app's associated domains still list this host), /_next, /ingest, and
 * any path with a file extension (sw.js: a browser refuses a redirected service
 * worker script, so an installed PWA could never update its worker).
 *
 * The target is the CANONICAL_SITE_URL constant, not the env-driven SITE_URL:
 * if NEXT_PUBLIC_SITE_URL were ever set to this host, SITE_URL would make the
 * redirect point at itself and every old link would loop.
 *
 * Preview deployments are untouched: only this exact host matches.
 */

import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';

export const LEGACY_HOST = 'tribe-v3.vercel.app';

const EXEMPT_PREFIXES = ['/api/', '/.well-known/', '/_next/', '/ingest/'];

/** WhatsApp, iMessage (sends facebookexternalhit), Facebook, X, Telegram, etc. */
const PREVIEW_BOT =
  /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|Pinterest|SkypeUriPreview|redditbot|Embedly/i;

export function isEmbeddedWebView(userAgent: string): boolean {
  if (/; wv\)/.test(userAgent)) return true;
  return /AppleWebKit/.test(userAgent) && !/Safari\//.test(userAgent);
}

export interface LegacyHostRequest {
  host: string | null;
  method: string;
  pathname: string;
  search: string;
  userAgent: string | null;
}

/** The absolute URL to 301 to, or null to serve the request as it is. */
export function legacyHostRedirect(req: LegacyHostRequest): string | null {
  const host = (req.host ?? '').toLowerCase().replace(/:\d+$/, '');
  if (host !== LEGACY_HOST) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;

  const path = req.pathname;
  if (EXEMPT_PREFIXES.some((p) => path === p.slice(0, -1) || path.startsWith(p))) return null;
  if (/\.\w+$/.test(path)) return null;

  const ua = req.userAgent ?? '';
  if (isEmbeddedWebView(ua) || PREVIEW_BOT.test(ua)) return null;

  return `${CANONICAL_SITE_URL}${path}${req.search}`;
}
