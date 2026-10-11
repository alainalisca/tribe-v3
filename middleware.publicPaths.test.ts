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

  it('keeps the T-GROW1 attribution beacon reachable by a signed-out stranger', () => {
    // FOUND ON THE PREVIEW, NOT HERE, which is the fourth entry in this file's
    // running theme: middleware's cookie gate runs before the handler, so a route
    // that authenticates itself is still 307'd to /auth unless it is listed.
    //
    // This one is the quietest of the four. /api/attr answers 204 and the client
    // fires it with keepalive and never reads the response, so a redirect and a
    // successful write are indistinguishable from the browser. The visit log
    // would have recorded NOTHING for exactly the signed-out population T-GROW1
    // exists to measure, the Origen tab would have shown zero visits forever, and
    // no error would have appeared anywhere.
    //
    // Both forms: the client posts the trailing-slash version, because
    // trailingSlash: true makes the bare path a 308 and that costs a round trip
    // on gym wifi.
    expect(isPublicPath('/api/attr')).toBe(true);
    expect(isPublicPath('/api/attr/')).toBe(true);
  });

  it('lets /api/attr/signup/ reach its handler, which authenticates itself (T-GROW1 part C)', () => {
    // Public here by the /api/attr prefix, and that is fine rather than an
    // accident: the route calls getUser() and answers 401 itself (route.test.ts
    // "refuses a signed-out caller"). What must NOT happen is a 307 to /auth,
    // because the client fires it with keepalive during the post-sign-in
    // navigation and never reads the answer, so a redirect would lose the
    // account's attribution silently, which is this file's running theme.
    expect(isPublicPath('/api/attr/signup/')).toBe(true);
  });

  it('lets a signed-out visitor reach /api/referral/inviter/ (the "Invitado por X" banner)', () => {
    // The banner's whole audience is signed out. Without this entry the fetch
    // is answered with a redirect to /auth, the banner stays hidden, and nothing
    // errors: the same silent shape as the browser lookup it replaced.
    expect(isPublicPath('/api/referral/inviter')).toBe(true);
    expect(isPublicPath('/api/referral/inviter/')).toBe(true);
    // Only this route: the rest of /api/referral keeps its session gate.
    expect(isPublicPath('/api/referral')).toBe(false);
    expect(isPublicPath('/api/referral/apply/')).toBe(false);
  });

  it('keeps the one-off outreach route reachable by its cron caller', () => {
    // Found by the dry run, not by review: the route checks CRON_SECRET itself,
    // but middleware's cookie gate runs first and 307s it to /auth. The
    // campaign would have been unreachable in production while every test
    // passed, because the tests call the handler directly and never traverse
    // middleware.
    expect(isPublicPath('/api/one-off/sports-nudge')).toBe(true);
    expect(isPublicPath('/api/one-off/sports-nudge/')).toBe(true);
  });

  it('keeps the universal-link association files reachable', () => {
    // Apple does NOT follow redirects for the AASA: a 307 to /auth is a
    // silently failed association, and nothing in the app reports it. Android
    // fetches assetlinks.json the same way, without cookies.
    expect(isPublicPath('/.well-known/apple-app-site-association')).toBe(true);
    expect(isPublicPath('/.well-known/assetlinks.json')).toBe(true);
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
