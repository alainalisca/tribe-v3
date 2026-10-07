/**
 * T-AV29. Mutation proofs:
 *   - return `new URL(request.url).origin` first -> "a LAN claim with the site
 *     URL set gets the LAN origin, never localhost" goes red (arm M1 does the
 *     same end to end)
 *   - ignore NEXT_PUBLIC_SITE_URL -> "the site URL wins" goes red (arm U1). The
 *     LAN case does NOT catch that one: its Host header is the LAN address too.
 */
import { describe, it, expect } from 'vitest';
import { publicOrigin } from './publicOrigin';

const req = (headers: Record<string, string>, url = 'http://localhost:3003/api/pase/') => ({
  url,
  headers: new Headers(headers),
});

describe('publicOrigin', () => {
  it('a LAN claim with the site URL set gets the LAN origin, never localhost', () => {
    expect(
      publicOrigin(req({ host: '192.168.8.230:3003' }), { NEXT_PUBLIC_SITE_URL: 'http://192.168.8.230:3003' })
    ).toBe('http://192.168.8.230:3003');
  });

  it('the site URL wins, path and trailing slash dropped (production)', () => {
    expect(publicOrigin(req({ host: 'internal:3000' }), { NEXT_PUBLIC_SITE_URL: 'https://tribe-v3.vercel.app/' })).toBe(
      'https://tribe-v3.vercel.app'
    );
  });

  it('without a site URL: the request Host, not request.url', () => {
    expect(publicOrigin(req({ host: '192.168.8.230:3003' }), {})).toBe('http://192.168.8.230:3003');
    expect(publicOrigin(req({ 'x-forwarded-host': 'tribe.app', 'x-forwarded-proto': 'https', host: 'x' }), {})).toBe(
      'https://tribe.app'
    );
    expect(publicOrigin(req({ host: 'tribe.app' }), {})).toBe('https://tribe.app');
  });

  it('a site URL that is not an absolute http(s) URL is ignored', () => {
    expect(publicOrigin(req({ host: '10.0.0.5:3003' }), { NEXT_PUBLIC_SITE_URL: 'tribe-v3.vercel.app' })).toBe(
      'http://10.0.0.5:3003'
    );
    expect(publicOrigin(req({ host: '10.0.0.5:3003' }), { NEXT_PUBLIC_SITE_URL: 'javascript:alert(1)' })).toBe(
      'http://10.0.0.5:3003'
    );
  });

  it('a forged Host carrying a path, credentials or a second URL is refused for request.url', () => {
    for (const host of ['evil.com/x', 'user@evil.com', 'evil.com http://x', 'a b']) {
      expect(publicOrigin(req({ host }), {})).toBe('http://localhost:3003');
    }
  });
});
