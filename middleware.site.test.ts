import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { config, isPublicPath, middleware } from './middleware';

/**
 * T-SITE1. The marketing site's pages are prerendered per language under
 * app/sitio/[lang]; middleware serves them at their public paths, picking the
 * language from the tribe_lang cookie (Spanish by default), and a signed-out `/`
 * is the site, not the feed's splash.
 */
const SITE_ROUTES = ['/para-atletas', '/deportes', '/coaches', '/gimnasios', '/tribe-os', '/tv', '/preguntas'];
const matcher = new RegExp(`^${config.matcher[0]}$`);
const rewriteOf = (res: Response) => {
  const target = res.headers.get('x-middleware-rewrite');
  return target ? new URL(target) : null;
};
const req = (path: string, cookie?: string) =>
  new NextRequest(`https://tribelatam.com${path}`, cookie ? { headers: { cookie } } : undefined);

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

describe('site pages are served in the cookie language (T-SITE1)', () => {
  beforeEach(() => getUser.mockReset());

  it.each(SITE_ROUTES)('%s/ is the Spanish page by default, at the same URL', async (route) => {
    const res = await middleware(req(`${route}/`));
    expect(rewriteOf(res)?.pathname).toBe(`/sitio/es${route}/`);
    expect(res.headers.get('Link')).toBe(`<https://tribelatam.com${route}/>; rel="canonical"`);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('serves English when tribe_lang=en, signed in or not', async () => {
    expect(rewriteOf(await middleware(req('/tv/', 'tribe_lang=en')))?.pathname).toBe('/sitio/en/tv/');
    const signedIn = await middleware(req('/coaches/', 'sb-x-auth-token=1; tribe_lang=en'));
    expect(rewriteOf(signedIn)?.pathname).toBe('/sitio/en/coaches/');
  });

  it('marks every site page Vary: Cookie, so no cache serves the other language', async () => {
    for (const path of ['/', '/coaches/', '/preguntas/']) {
      expect((await middleware(req(path, 'tribe_lang=en'))).headers.get('Vary')).toBe('Cookie');
    }
  });

  it('treats an unknown cookie value as Spanish', async () => {
    expect(rewriteOf(await middleware(req('/tv/', 'tribe_lang=fr')))?.pathname).toBe('/sitio/es/tv/');
  });

  it('redirects internal URLs and the old /inicio to their public path', async () => {
    for (const [from, to] of [
      ['/sitio/en/tv/', '/tv/'],
      ['/sitio/es/', '/'],
      ['/inicio/', '/'],
      ['/inicio', '/'],
    ]) {
      const res = await middleware(req(from));
      expect(res.status, from).toBe(308);
      expect(new URL(res.headers.get('location') ?? '').pathname, from).toBe(to);
    }
  });
});

describe('signed-out `/` is the site (T-SITE1)', () => {
  beforeEach(() => getUser.mockReset());

  it('rewrites to Inicio with no auth round trip, keeping the URL and the query', async () => {
    const res = await middleware(req('/?src=ig&utm_campaign=tv'));
    const target = rewriteOf(res);
    // trailingSlash:true is applied by the router, not here, so either form.
    expect(target?.pathname).toMatch(/^\/sitio\/es\/?$/);
    expect(target?.searchParams.get('src')).toBe('ig');
    expect(target?.searchParams.get('utm_campaign')).toBe('tv');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('declares `/` canonical, not the internal path', async () => {
    const res = await middleware(req('/'));
    expect(res.headers.get('Link')).toBe('<https://tribelatam.com/>; rel="canonical"');
  });

  it('leaves `/` to the feed when an auth cookie exists, chunked or not', async () => {
    for (const name of ['sb-twyplulysepbeypqralz-auth-token', 'sb-twyplulysepbeypqralz-auth-token.0']) {
      const res = await middleware(req('/', `${name}=x`));
      expect(res.headers.get('x-middleware-rewrite')).toBeNull();
      expect(res.status).toBe(200);
    }
  });

  it('ignores unrelated cookies', async () => {
    const res = await middleware(req('/', 'ph_phc_x_posthog=1; language=es'));
    expect(rewriteOf(res)?.pathname).toMatch(/^\/sitio\/es\/?$/);
  });
});
