import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Tribe middleware does three things, in order:
 *
 *   1. Content-Security-Policy header (allowlist-based; see rationale below)
 *   2. Public-path short-circuit (marketing routes, webhooks, static assets)
 *   3. Auth gate (Supabase cookie → redirect to /auth if unauthenticated)
 *
 * CSP rationale — WHY we're not using nonces
 * ──────────────────────────────────────────
 * An earlier version of this middleware generated a per-request nonce and
 * used `'strict-dynamic' 'nonce-<base64>'` on script-src. That's the
 * strongest practical CSP for a Next.js app, BUT it is fundamentally
 * incompatible with our ISR strategy:
 *
 *   - /instructors and /profile/[userId] use `export const revalidate = 60`,
 *     so Next.js renders once and serves the HTML from the Vercel edge
 *     cache for up to 60 seconds.
 *   - Nonces must be fresh per request (that's the whole security value).
 *   - Cached HTML + per-request CSP header = the cached <script> tags
 *     carry the old nonce (or no nonce), the response CSP requires the
 *     new nonce, and every script gets blocked by the browser.
 *
 * The symptom was catastrophic: the home page rendered its splash loader,
 * but no JavaScript executed → auth never resolved → the splash sat there
 * forever. Reported by Al on 2026-04-21 immediately after the first prod
 * deploy with nonce CSP.
 *
 * So we're back to the allowlist form: `'self' 'unsafe-inline' <origins>`.
 * This is the standard Next.js CSP. It's weaker than a nonce CSP (a
 * reflected-XSS could execute an injected <script>), but:
 *
 *   - Next.js' own inline scripts are all framework-controlled, which
 *     limits the real attack surface.
 *   - The other security headers (HSTS, X-Frame-Options, frame-ancestors
 *     'none', object-src 'none', base-uri 'self', form-action 'self')
 *     still apply — those don't interact with caching.
 *
 * If we ever want nonce CSP back, the correct path is:
 *   (a) migrate off ISR entirely (back to force-dynamic everywhere),
 *   (b) set Cache-Control: no-store on every response, and
 *   (c) accept the perf/cost regression that comes with it.
 * Not a trade we're willing to make today.
 */

const publicPaths = [
  '/',
  '/auth',
  '/legal',
  '/invite',
  '/session',
  '/s', // public session share pages (/s/[id]) — must be viewable + scrapable without auth
  '/i', // public instructor share pages (/i/[id]) — must be viewable + scrapable without auth
  '/g', // public gym share pages (/g/[slug]) — bio-link destination; must be viewable + scrapable without auth
  '/pase', // T-LEAD1 digital pass (/pase/[slug]) -- the QR on a printed voucher; the visitor has no account and may never make one
  '/about',
  '/faq',
  '/for-instructors',
  '/download', // static app-download page (public/download/index.html) — must be reachable without auth
  '/_next',
  '/sw.js',
  '/manifest.json',
];

const publicApiPaths = [
  '/api/auth/signup',
  '/api/generate-calendar',
  '/api/webhook/chat-message',
  '/api/payment/webhook/stripe', // Stripe sends webhooks without a session cookie; signature is verified in the handler.
  '/api/payment/webhook/wompi', // Wompi webhook — HMAC SHA256 signature verified in the handler; no cookie.
  '/api/health', // LR-02: monitoring probes don't carry session cookies
  '/api/tribe-os-waitlist', // Public marketing form on the landing page; rate-limited by IP in the handler.
  '/api/pase', // T-LEAD1 pass claim; unauthenticated by design, rate-limited by IP plus honeypot and time-on-page in the handler.
  '/api/og', // OG preview images for share cards; link scrapers (WhatsApp, etc.) carry no session cookie.
  // Internal server-to-server endpoints invoked via fetch() with an
  // `Authorization: Bearer ${CRON_SECRET}` header (NOT a cookie). Without
  // these exemptions the session gate redirected the internal fetch to /auth,
  // which silently broke: host "someone joined your session" + nearby-session
  // push (via /api/notifications/send), and the weekly recap / inactive nudge
  // emails (called by the weekly cron). Each handler enforces CRON_SECRET via
  // isValidCronAuth(), so skipping the cookie check here is safe.
  '/api/notifications/send',
  '/api/send-weekly-recap',
  '/api/send-inactive-nudge',
  '/api/send-attendance-notification', // cron (CRON_SECRET) or user session — both checked in the handler
  '/api/send-welcome-email', // welcome onboarding email cron (CRON_SECRET); enforced via isValidCronAuth() in the handler

  // T-AV0. "Is the athlete_value flag on for me" must be answerable WITHOUT a
  // session, because a signed-out visitor is one of the answers -- and it is
  // the answer `no`. Behind the auth gate the endpoint 307s to /auth, so a
  // client component on a public page would read a redirect as an outage
  // rather than as a flag being off, and would have every reason to guess.
  // Nothing is exposed: the route reports a boolean about the caller and never
  // what is behind the flag. Each T-AV route and page gates itself.
  '/api/features',

  // Clicked from an inbox, where there is no session cookie by definition.
  // Without this the auth gate redirects the unsubscribe link to /auth and the
  // only way to stop receiving email silently stops working -- the same shape
  // as #52, where this gate redirected all 17 crons to /auth for months.
  // Authorization is the 128-bit single-use token in the query string.
  '/api/unsubscribe',

  // One-off outreach, triggered server-to-server with a CRON_SECRET bearer and
  // no session cookie -- the same shape as /api/cron below. Without this the
  // auth gate 307s it to /auth and the campaign is simply unreachable, which
  // is #52 again: that gate silently redirected all 17 crons for months.
  // isValidCronAuth() in the handler is the actual authorization, and dryRun
  // defaults to true there.
  '/api/one-off',

  // Universal Link / App Link association files. Apple's CDN and Android's
  // verifier fetch these with no cookies, and APPLE DOES NOT FOLLOW REDIRECTS
  // for the AASA -- a 307 to /auth is simply a failed association, silently,
  // with no way to tell from the app that it never worked.
  //
  // assetlinks.json happens to serve 200 today because it exists as a static
  // file; a MISSING extensionless path under the same directory returns 307
  // (measured 2026-09-22). Relying on that ordering is relying on an
  // implementation detail of which handler wins, so the exemption is explicit.
  '/.well-known',

  // Vercel Cron invocations carry an `Authorization: Bearer ${CRON_SECRET}`
  // header, NOT a session cookie. Without this exemption the cookie-based
  // session gate below redirects every cron run to /auth before it reaches
  // its handler — which silently broke EVERY job in vercel.json (recurring
  // sessions, engagement, subscription-expiry, etc.). Each cron handler
  // independently enforces the secret via isValidCronAuth(), so skipping the
  // cookie check here is safe (same model as the Stripe webhook above).
  '/api/cron',
];

// Exported so middleware.publicPaths.test.ts can pin which routes skip the auth
// gate. Next.js only reserves `middleware` and `config` on this file; extra
// named exports are fine (same reasoning as buildCsp below).
export function isPublicPath(pathname: string): boolean {
  if (
    publicPaths.some((path) => {
      if (path === '/') return pathname === '/';
      return pathname === path || pathname.startsWith(path + '/');
    })
  ) {
    return true;
  }

  if (publicApiPaths.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
    return true;
  }

  return false;
}

// Exported so middleware.csp.test.ts can pin the served policy. Next.js only
// reserves `middleware` and `config` on this file; extra named exports are fine.
/**
 * The LOCAL Supabase stack's origins, or nothing at all.
 *
 * T-AV0 Step 4. The CSP allows `https://*.supabase.co`, which is every
 * Supabase project except the one running in Docker on a developer's machine.
 * Measured 2026-09-26: with the app pointed at http://127.0.0.1:54321, the
 * browser refused every request to it, so signing in returned "No account
 * found with these credentials" while the SAME credentials returned a token to
 * curl in the same second. A CSP refusal is not reported as a refusal anywhere
 * anyone looks -- it surfaces as a failed fetch, which the auth form maps to
 * its friendliest error, so the symptom points at the data and the cause is in
 * a header.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE IS `http:` PLUS A PRIVATE ADDRESS, AND THE PROTOCOL IS THE LOAD-
 * BEARING HALF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Production Supabase is always https. So requiring `http:` means this can
 * never add anything for any https URL, whatever its hostname -- which is a
 * stronger and much easier property to check than reasoning about which
 * hostnames are safe.
 *
 * Loopback alone is not enough, and the first version of this got that wrong.
 * Step 4.6 of the ticket is phone testing: the phone opens the app at the
 * Mac's LAN address, and `127.0.0.1` from the phone means THE PHONE. So
 * `.env.av.local` has to name the Mac's LAN address, which is not loopback,
 * and a loopback-only check would silently re-break exactly the case it was
 * extended for. Private IPv4 ranges are therefore included, and only those:
 * a public address over http gets nothing.
 */
function localSupabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return [];
  }
  // Production is https. This is what makes the rest of the check unable to
  // widen a production CSP by one character, regardless of hostname.
  if (url.protocol !== 'http:') return [];

  const host = url.hostname;
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  // RFC 1918 only: 10/8, 172.16/12, 192.168/16. Matched on the parsed octets
  // rather than a string prefix, so "10.x" cannot be spoofed by a hostname
  // that merely starts with those characters.
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)?.slice(1).map(Number);
  const privateLan =
    !!octets &&
    octets.every((n) => n >= 0 && n <= 255) &&
    (octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168));

  if (!loopback && !privateLan) return [];
  // ws:, not wss: -- the local stack speaks plain http, and realtime over wss
  // to a plaintext server is refused by the browser, not by the CSP.
  return [url.origin, url.origin.replace(/^http/, 'ws')];
}

export function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const localSupabase = localSupabaseOrigins();
  const withLocal = (directive: string) =>
    localSupabase.length ? `${directive} ${localSupabase.join(' ')}` : directive;

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'", // Required: Next.js inject inline scripts for hydration + framework glue.
    isDev ? "'unsafe-eval'" : '', // Dev-only: Next.js HMR uses eval; prod forbids it.
    'https://us.i.posthog.com',
    'https://us-assets.i.posthog.com',
    'https://vercel.live',
    'https://unpkg.com',
    'https://maps.googleapis.com',
  ]
    .filter(Boolean)
    .join(' ');

  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': scriptSrc,
    'style-src': "'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
    'img-src': withLocal("'self' https: data: blob:"),
    'font-src': "'self' data: https://fonts.gstatic.com https://vercel.live",
    // Cloudflare Stream hosts: upload.videodelivery.net receives the direct
    // upload POST, *.cloudflarestream.com and videodelivery.net serve the HLS
    // manifest and segments.
    'connect-src': withLocal(
      "'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://maps.googleapis.com https://fcm.googleapis.com https://vercel.live https://fonts.googleapis.com https://fonts.gstatic.com https://images.unsplash.com https://*.tile.openstreetmap.org https://unpkg.com https://api.open-meteo.com https://*.cloudflarestream.com https://videodelivery.net https://upload.videodelivery.net"
    ),
    // media-src was never set, so <video> and <audio> fell back to default-src
    // 'self' and every Supabase-hosted intro video was refused in production.
    // blob: covers object URLs used for client-side duration probing.
    'media-src': withLocal(
      "'self' blob: https://*.supabase.co https://*.cloudflarestream.com https://videodelivery.net"
    ),
    // *.cloudflarestream.com so the Stream iframe player remains an option.
    'frame-src': "'self' https://vercel.live https://*.cloudflarestream.com",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'none'",
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', buildCsp());
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static asset short-circuit.
  if (pathname.match(/\.\w+$/)) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Public routes don't need auth but still need security headers.
  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  // Auth-gated routes: check Supabase session cookie.
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const returnTo = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    const redirectUrl = new URL(`/auth?returnTo=${returnTo}`, request.url);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  return applySecurityHeaders(response);
}

export const config = {
  // Apply to everything except Next.js internals and static image extensions.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
