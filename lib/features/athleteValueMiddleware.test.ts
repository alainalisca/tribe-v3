/**
 * T-AV0, Step 6. The middleware exemption for /api/features.
 *
 * It lives in its own file rather than in middleware.publicPaths.test.ts so
 * that deleting the T-AV program later takes its test with it, instead of
 * leaving an orphan assertion in main's file about a route nobody remembers
 * adding.
 *
 * WHY THE EXEMPTION EXISTS: the endpoint answers "is athlete_value on for the
 * caller", and one of the real answers is "you are signed out, so no". Behind
 * the session gate that question 307s to /auth, which a client component reads
 * as an outage rather than as a flag being off -- and a client that cannot get
 * an answer is a client that guesses.
 *
 * WHAT MUST STAY TRUE: exempting it from the COOKIE gate exempts nothing else.
 * The endpoint reports a boolean about the caller and never what is behind the
 * flag; every T-AV page and route gates itself with the same resolver.
 */
import { describe, it, expect } from 'vitest';
import { isPublicPath } from '@/middleware';

describe('/api/features is reachable without a session', () => {
  it('exempts the flag endpoint', () => {
    expect(isPublicPath('/api/features/athlete-value')).toBe(true);
    // trailingSlash: true is set in next.config, so the served path has one.
    expect(isPublicPath('/api/features/athlete-value/')).toBe(true);
  });

  it('does not make neighbouring /api/feature-prefixed routes public', () => {
    // The prefix match is on `/api/features` plus a separator, not on the
    // string. Without that, an /api/features-admin route invented later would
    // inherit this exemption silently -- the shape the /g and /pase entries in
    // middleware.publicPaths.test.ts each guard against.
    expect(isPublicPath('/api/features-admin')).toBe(false);
    expect(isPublicPath('/api/featuresomething')).toBe(false);
  });

  it('still gates an ordinary authenticated route', () => {
    // The satisfiability arm's mirror: proves the exemption is what let the
    // first case through, not that isPublicPath says true to everything.
    expect(isPublicPath('/api/me/training')).toBe(false);
    expect(isPublicPath('/dashboard')).toBe(false);
  });
});
