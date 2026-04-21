import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Tribe middleware does three things, in order:
 *
 *   1. CSP nonce generation + Content-Security-Policy header
 *   2. Public-path short-circuit (marketing routes, webhooks, static assets)
 *   3. Auth gate (Supabase cookie → redirect to /auth if unauthenticated)
 *
 * CSP rationale
 * ─────────────
 * Previously the CSP lived in next.config.ts headers() and used
 * `'unsafe-inline'` on script-src to allow Next.js' hydration scripts. That's
 * the weakest form — any reflected-XSS turns into script execution.
 *
 * This middleware now generates a per-request nonce and uses
 * `'strict-dynamic'` + `'nonce-<base64>'`, which is the strongest practical
 * CSP for a Next.js app: only scripts Next.js injects (with the nonce) run,
 * and any scripts they load inherit trust via strict-dynamic. External
 * allowlisted origins (PostHog, Vercel Live, Google Maps, unpkg for Leaflet)
 * are kept as explicit sources because they're loaded by framework scripts
 * that may not carry our nonce.
 *
 * style-src keeps `'unsafe-inline'` because:
 *   - React sets style={...} via CSSOM (already CSP-exempt, but some libs use
 *     <style> tags), and
 *   - Framer Motion injects <style> tags without nonces.
 * We can revisit once we audit every library.
 *
 * Dev mode additionally allows `'unsafe-eval'` for Next.js HMR.
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

const publicApiPaths = ['/api/auth/signup', '/api/generate-calendar', '/api/webhook/chat-message'];

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

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';

  // In dev, Next.js uses eval for fast refresh; in prod we forbid eval entirely.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : '',
    // External origins that Next.js' framework scripts load but which don't
    // inherit our nonce via strict-dynamic reliably across browsers.
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

function applySecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  // These used to live in next.config.ts but we centralize them here so the
  // nonce-bearing CSP and the rest of the security headers are colocated.
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Per-request CSP nonce. Web Crypto's randomUUID is available on Edge.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // Propagate the nonce to the app via a request header so Server Components
  // can read it from `headers()` and spread it onto <Script nonce={...} />.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  // Static asset short-circuit (we still want CSP on the response).
  if (pathname.match(/\.\w+$/)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applySecurityHeaders(res, csp);
  }

  // Public routes don't need auth but still need CSP.
  if (isPublicPath(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    return applySecurityHeaders(res, csp);
  }

  // Auth-gated routes: check Supabase session cookie.
  const response = NextResponse.next({ request: { headers: requestHeaders } });

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
    return applySecurityHeaders(NextResponse.redirect(redirectUrl), csp);
  }

  return applySecurityHeaders(response, csp);
}

export const config = {
  // Apply to everything except Next.js internals and static image extensions.
  // (Static JS/CSS still gets headers from the response, but we skip those
  // paths here to avoid re-running auth logic unnecessarily.)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
