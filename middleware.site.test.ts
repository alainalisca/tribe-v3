import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { config, isPublicPath, middleware } from './middleware';

/**
 * T-SITE1. The marketing site's routes must reach their pages signed out, and a
 * signed-out `/` must be the site, not the feed's splash.
 */
const SITE_ROUTES = ['/inicio', '/para-atletas', '/deportes', '/coaches', '/gimnasios', '/tribe-os', '/tv', '/preguntas'];
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe('site routes are public (T-SITE1)', () => {
  it.each(SITE_ROUTES.flatMap((r) => [r, `${r}/`]))('%s skips the auth gate and runs middleware', (path) => {
    expect(isPublicPath(path)).toBe(true);
    expect(matcher.test(path)).toBe(true);
  });

  it('does not make look-alike paths public', () => {
    expect(isPublicPath('/tvshows')).toBe(false);
    expect(isPublicPath('/coaches-admin')).toBe(false);
    // Tribe.OS's own coach list stays behind the gate.
    expect(isPublicPath('/os/coaches')).toBe(false);
  });
});

describe('signed-out `/` is the site (T-SITE1)', () => {
  beforeEach(() => getUser.mockReset());

  it('rewrites to /inicio with no auth round trip, keeping the URL and the query', async () => {
    const res = await middleware(new NextRequest('https://tribelatam.com/?src=ig&utm_campaign=tv'));
    const target = new URL(res.headers.get('x-middleware-rewrite') ?? '');
    // trailingSlash:true is applied by the router, not here, so either form.
    expect(target.pathname).toMatch(/^\/inicio\/?$/);
    expect(target.searchParams.get('src')).toBe('ig');
    expect(target.searchParams.get('utm_campaign')).toBe('tv');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('declares `/` canonical, not /inicio/', async () => {
    const res = await middleware(new NextRequest('https://tribelatam.com/'));
    expect(res.headers.get('Link')).toBe('<https://tribelatam.com/>; rel="canonical"');
  });

  it('leaves `/` to the feed when an auth cookie exists, chunked or not', async () => {
    for (const name of ['sb-twyplulysepbeypqralz-auth-token', 'sb-twyplulysepbeypqralz-auth-token.0']) {
      const req = new NextRequest('https://tribelatam.com/', { headers: { cookie: `${name}=x` } });
      const res = await middleware(req);
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      expect(res.status).toBe(200);
    }
  });

  it('ignores unrelated cookies', async () => {
    const req = new NextRequest('https://tribelatam.com/', { headers: { cookie: 'ph_phc_x_posthog=1; language=es' } });
    const res = await middleware(req);
    expect(res.headers.get('x-middleware-rewrite')).toMatch(/\/inicio\/?$/);
  });

  it('a direct /inicio/ visit is canonical to `/` too', async () => {
    const res = await middleware(new NextRequest('https://tribelatam.com/inicio/'));
    expect(res.headers.get('Link')).toBe('<https://tribelatam.com/>; rel="canonical"');
  });
});
