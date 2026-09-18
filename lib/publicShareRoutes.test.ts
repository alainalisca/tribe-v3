import { describe, it, expect } from 'vitest';
import {
  isPublicShareRoute,
  shouldSuppressInstallPrompt,
  PUBLIC_SHARE_ROUTE_PREFIXES,
  SIGNUP_FLOW_PREFIXES,
} from './publicShareRoutes';

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

describe('shouldSuppressInstallPrompt — the union, and only for the install prompt', () => {
  it.each(['/auth/', '/auth', '/auth/callback/', '/onboarding/', '/onboarding/role/', '/partners/apply/'])(
    'suppresses on the signup flow: %s',
    (p) => expect(shouldSuppressInstallPrompt(p)).toBe(true)
  );

  it.each(['/g/bullbox/', '/i/abc/', '/invite/xyz'])('still suppresses on public share routes: %s', (p) =>
    expect(shouldSuppressInstallPrompt(p)).toBe(true)
  );

  it.each(['/home', '/sessions', '/storefront/abc/', '/instructors', '/partners', '/partners/'])(
    'leaves the prompt alone elsewhere: %s',
    (p) => expect(shouldSuppressInstallPrompt(p)).toBe(false)
  );

  it('tolerates the slash-less pathname usePathname can report mid-transition', () => {
    // trailingSlash:true serves '/auth/', but a client-side transition can
    // report '/auth' for a render -- long enough to arm the 3s timer.
    expect(shouldSuppressInstallPrompt('/auth')).toBe(true);
    expect(shouldSuppressInstallPrompt('/onboarding')).toBe(true);
    // ...without matching a different route that merely shares the prefix.
    expect(shouldSuppressInstallPrompt('/authenticate')).toBe(false);
    expect(shouldSuppressInstallPrompt('/onboardings')).toBe(false);
  });

  it('is false for null, undefined and empty', () => {
    expect(shouldSuppressInstallPrompt(null)).toBe(false);
    expect(shouldSuppressInstallPrompt(undefined)).toBe(false);
    expect(shouldSuppressInstallPrompt('')).toBe(false);
  });
});

describe('the two lists stay separate', () => {
  it('the signup flow is NOT in the public-share list', () => {
    // The whole point of the split: FeedbackWidget's question is unchanged, so
    // it must keep rendering on /auth and /onboarding. If a future edit folds
    // these together, this fails.
    for (const p of ['/auth/', '/onboarding/role/', '/partners/apply/']) {
      expect(isPublicShareRoute(p)).toBe(false);
    }
  });

  /**
   * A pin, not a formality. Every prefix here switches OFF the install prompt
   * and the feedback widget for a whole route tree, so the list growing by
   * accident is a silent loss of two surfaces. Adding one should mean editing
   * this line and saying why.
   *
   * /pase/ added for T-LEAD1: the visitor is standing in a gym holding a paper
   * voucher and has never heard of Tribe, so an install wall or a bug reporter
   * over the form costs the lead the page exists to capture.
   */
  it('the public-share list is unchanged', () => {
    expect([...PUBLIC_SHARE_ROUTE_PREFIXES]).toEqual(['/invite/', '/g/', '/i/', '/pase/']);
  });

  it('every prefix in both lists ends with a slash', () => {
    for (const p of [...PUBLIC_SHARE_ROUTE_PREFIXES, ...SIGNUP_FLOW_PREFIXES]) {
      expect(p.endsWith('/'), p).toBe(true);
    }
  });
});
