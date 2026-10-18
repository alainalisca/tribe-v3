import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { middleware } from './middleware';

/**
 * T-SHARE1 Part C: a coach's link and its card pass middleware as they are,
 * query string included, so ?ref= (T-GROW1 attribution, later) reaches the
 * page. The same for the site's sport links and cards (Part B).
 */
const req = (path: string) => new NextRequest(`https://tribelatam.com${path}`);
const passes = (res: Response) =>
  res.status === 200 && !res.headers.get('location') && !res.headers.get('x-middleware-rewrite');

describe('coach links keep their query string', () => {
  it.each([
    '/i/andres/?ref=ana',
    '/i/34d56f30-f8d2-4588-beaa-07ee53d13d1d/?ref=ana&utm_source=wa',
    '/i/andres/card/?v=abc',
  ])('%s goes through untouched, signed out', async (path) => {
    const res = await middleware(req(path));
    expect(passes(res)).toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('a sport link keeps its query string through the language rewrite', async () => {
    const res = await middleware(req('/deportes/boxeo/?ref=ana'));
    const target = new URL(res.headers.get('x-middleware-rewrite')!);
    expect(target.pathname).toBe('/sitio/es/deportes/boxeo/');
    expect(target.searchParams.get('ref')).toBe('ana');
  });

  it("a site page's card is served as it is, the one /sitio URL that is", async () => {
    expect(passes(await middleware(req('/sitio/es/deportes/boxeo/card/')))).toBe(true);
    expect((await middleware(req('/sitio/es/coaches/'))).status).toBe(308);
  });
});
