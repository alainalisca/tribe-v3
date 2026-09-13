import { describe, it, expect } from 'vitest';
import { isPublicPath, config } from './middleware';

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

  it('still gates an authenticated route', () => {
    expect(isPublicPath('/home')).toBe(false);
    expect(isPublicPath('/storefront/040cbc21/')).toBe(false);
  });
});
