/**
 * T-ANALYTICS1 part D: session_viewed's `source` from the previous in-app page.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { __resetNavigationForTests, pathBefore, recordNavigation, sessionViewSourceFrom } from './navigationSource';

beforeEach(() => __resetNavigationForTests());

describe('pathBefore', () => {
  it('is null on the first page of a visit', () => {
    recordNavigation('/session/abc/');
    expect(pathBefore('/session/abc/')).toBeNull();
  });

  it('gives the page before, once the provider has recorded the current one', () => {
    recordNavigation('/');
    recordNavigation('/session/abc/');
    expect(pathBefore('/session/abc/')).toBe('/');
  });

  it('gives the same answer when the page asks BEFORE the provider recorded it', () => {
    // Effect order between the page and the provider is not something the
    // reader may depend on.
    recordNavigation('/');
    expect(pathBefore('/session/abc/')).toBe('/');
  });

  it('treats a trailing slash as the same page (next.config trailingSlash: true)', () => {
    recordNavigation('/profile/u1/');
    recordNavigation('/profile/u1');
    recordNavigation('/session/abc');
    expect(pathBefore('/session/abc/')).toBe('/profile/u1');
  });
});

describe('sessionViewSourceFrom', () => {
  it.each([
    [null, 'direct'],
    ['/', 'feed'],
    ['/feed', 'feed'],
    ['/s/abc', 'share_link'],
    ['/profile/u1', 'profile'],
    ['/i/u1', 'profile'],
    ['/g/bullbox', 'profile'],
    ['/instructors', 'profile'],
    ['/storefront/u1', 'profile'],
    ['/notifications', 'other'],
    ['/my-training', 'other'],
  ])('from %s -> %s', (previous, source) => {
    expect(sessionViewSourceFrom(previous)).toBe(source);
  });

  it('never claims map: no session map exists', () => {
    for (const p of [null, '/', '/instructors', '/feed', '/search', '/training-now']) {
      expect(sessionViewSourceFrom(p)).not.toBe('map');
    }
  });
});
