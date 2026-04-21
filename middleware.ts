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
  '/about',
  '/faq',
  '/for-instructors',
  '/_next',
  '/sw.js',
  '/manifest.json',
];

const publicApiPaths = [
  '/api/auth/signup',
  '/api/generate-calendar',
  '/api/webhook/chat-message',
  '/api/health', // LR-02: monitoring probes don't carry session cookies
];

function isPublicPath(pathname: string): boolean {
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

function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== 'production';

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
    'img-src': "'self' https: data: blob:",
    'font-src': "'self' data: https://fonts.gstatic.com https://vercel.live",
    'connect-src':
      "'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://maps.googleapis.com https://fcm.googleapis.com https://vercel.live https://fonts.googleapis.com https://fonts.gstatic.com https://images.unsplash.com https://*.tile.openstreetmap.org https://unpkg.com https://api.open-meteo.com",
    'frame-src': "'self' https://vercel.live",
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
