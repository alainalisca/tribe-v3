import { describe, it, expect } from 'vitest';
import { isPublicPath, config } from './middleware';
import { isPublicShareRoute, shouldSuppressInstallPrompt } from '@/lib/publicShareRoutes';

/**
 * T-GYM3 Step 1.
 *
 * /g/[slug] is the permanent bio-link destination for gyms. If it is not in
 * `publicPaths`, every logged-out visit 302s to /auth and the entire feature is
 * dead — and no other test in this repo would catch it, because every page test
 * mocks the DAL and never runs middleware.
 *
 * These assertions pin the three layers a request has to survive before the
 * page component is even reached:
 *
 *   1. the `config.matcher` regex (middleware runs at all)
 *   2. the static-asset short-circuit in `middleware()`
 *   3. `isPublicPath()` (skip the Supabase cookie gate)
 *
 * `trailingSlash: true` in next.config.ts means the canonical URL a visitor
 * actually lands on is `/g/bullbox/`, WITH the slash, so that form is asserted
 * first-class rather than as an afterthought.
 */

// Mirrors the static-asset short-circuit at the top of middleware().
const STATIC_ASSET = /\.\w+$/;

// config.matcher entries are Next.js path patterns; this one is already a bare
// regex body, so anchoring it reproduces what Next.js compiles it to.
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe('/g is public (T-GYM3)', () => {
  const gymPaths = [
    '/g',
    '/g/',
    '/g/bullbox',
    '/g/bullbox/', // the form trailingSlash:true actually serves
    '/g/040cbc21-1b11-4ae1-aa99-9fe35a32bda0/', // UUID links keep working
    '/g/does-not-exist/', // must reach the page so it can render 404, not /auth
  ];

  it.each(gymPaths)('%s skips the auth gate', (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(gymPaths)('%s is matched by config.matcher, so middleware runs', (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });

  it.each(gymPaths)('%s is not swallowed by the static-asset short-circuit', (pathname) => {
    expect(STATIC_ASSET.test(pathname)).toBe(false);
  });

  it('does not accidentally make neighbouring /g-prefixed routes public', () => {
    // The prefix test requires an exact match or a following slash, so a route
    // that merely starts with the letter g stays auth-gated.
    expect(isPublicPath('/gyms')).toBe(false);
    expect(isPublicPath('/groups/1')).toBe(false);
  });
});

describe('existing public surfaces survive the change', () => {
  it('keeps /api/og public for link scrapers', () => {
    // WhatsApp/iMessage scrapers carry no session cookie. Both the bare path and
    // the trailing-slash form generateMetadata builds must pass.
    expect(isPublicPath('/api/og')).toBe(true);
    expect(isPublicPath('/api/og/')).toBe(true);
  });

  it('keeps the instructor and session share pages public', () => {
    expect(isPublicPath('/i/abc/')).toBe(true);
    expect(isPublicPath('/s/abc/')).toBe(true);
  });

  it('keeps the unsubscribe link reachable from an inbox', () => {
    // No session cookie exists when a link is clicked from an email client.
    // If this gate catches /api/unsubscribe the link 302s to /auth and the
    // only way to stop receiving mail silently stops working -- #52, where
    // all 17 crons were redirected to /auth for months, in miniature.
    expect(isPublicPath('/api/unsubscribe')).toBe(true);
    expect(isPublicPath('/api/unsubscribe/')).toBe(true);
    // No ?token= case: isPublicPath is handed nextUrl.pathname, which never
    // carries a query. Asserting on one would be asserting on an input the
    // function cannot receive -- a case that passes or fails for reasons
    // unrelated to anything real.
  });

  it('still gates an authenticated route', () => {
    expect(isPublicPath('/home')).toBe(false);
    expect(isPublicPath('/storefront/040cbc21/')).toBe(false);
  });
});

/**
 * T-LEAD1.
 *
 * /pase/[slug] is reached by scanning a QR on a paper voucher in a gym. The
 * visitor has no account and may never make one, so a redirect to /auth is not
 * a detour, it is the end of the funnel -- and the printed QR cannot be
 * recalled once the vouchers are out.
 *
 * Same three layers as /g above, plus the two lists that keep in-app chrome
 * off a stranger's first impression.
 */
describe('/pase is public (T-LEAD1)', () => {
  const pasePaths = [
    '/pase',
    '/pase/',
    '/pase/bullbox',
    '/pase/bullbox/', // the form trailingSlash:true actually serves
    '/pase/salomon/', // an instructor pass is a data change, not a code change
    '/pase/does-not-exist/', // must reach the page so it can render its own inactive state
  ];

  it.each(pasePaths)('%s skips the auth gate', (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(pasePaths)('%s is matched by config.matcher, so middleware runs', (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });

  it.each(pasePaths)('%s is not swallowed by the static-asset short-circuit', (pathname) => {
    expect(STATIC_ASSET.test(pathname)).toBe(false);
  });

  it('exempts the POST endpoint from the cookie gate', () => {
    expect(isPublicPath('/api/pase')).toBe(true);
    expect(isPublicPath('/api/pase/')).toBe(true);
  });

  it('does not make neighbouring /pase-prefixed routes public', () => {
    expect(isPublicPath('/pases')).toBe(false);
    expect(isPublicPath('/paseo/1')).toBe(false);
  });

  /**
   * The install modal and the feedback widget both read these lists. A
   * full-screen "get the app" sheet over the form, or an internal bug reporter
   * on it, is the same lost lead as a redirect to /auth.
   */
  it('suppresses in-app chrome on the pass page', () => {
    expect(isPublicShareRoute('/pase/bullbox/')).toBe(true);
    expect(isPublicShareRoute('/pase/bullbox')).toBe(true);
    expect(shouldSuppressInstallPrompt('/pase/bullbox/')).toBe(true);
    // and still does not sweep up a route that merely starts the same way
    expect(isPublicShareRoute('/pases')).toBe(false);
  });
});
