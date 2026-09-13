import { describe, it, expect } from 'vitest';
import { isPublicShareRoute, PUBLIC_SHARE_ROUTE_PREFIXES } from './publicShareRoutes';

describe('isPublicShareRoute', () => {
  it.each(['/g/bullbox/', '/g/040cbc21-1b11-4ae1-aa99-9fe35a32bda0/', '/i/abc/', '/invite/xyz'])(
    'is true for %s',
    (p) => expect(isPublicShareRoute(p)).toBe(true)
  );

  it.each(['/home', '/sessions', '/storefront/abc/', '/instructors', '/groups/1', '/invitations', '/'])(
    'is false for %s',
    (p) => expect(isPublicShareRoute(p)).toBe(false)
  );

  it('requires the trailing slash on the prefix, so no neighbouring route is swept up', () => {
    // '/instructors' starts with '/i' but not '/i/'. This is the assertion that
    // would fail if someone "simplified" the prefixes by dropping the slash.
    expect(PUBLIC_SHARE_ROUTE_PREFIXES.every((p) => p.endsWith('/'))).toBe(true);
    expect(isPublicShareRoute('/instructors')).toBe(false);
    expect(isPublicShareRoute('/groups/1')).toBe(false);
  });

  it('is false for a null or empty pathname rather than throwing', () => {
    expect(isPublicShareRoute(null)).toBe(false);
    expect(isPublicShareRoute(undefined)).toBe(false);
    expect(isPublicShareRoute('')).toBe(false);
  });

  it('does NOT include /s/ -- that judgement lives in NAV-02', () => {
    // A shared session is mid-funnel and booking it needs the app, unlike a gym
    // bio link which is top-of-funnel. Deliberate, not an oversight.
    expect(isPublicShareRoute('/s/abc/')).toBe(false);
  });
});
