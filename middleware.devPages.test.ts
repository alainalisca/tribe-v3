import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { middleware } from './middleware';

/** T-UI-FD1: /dev pages are a real 404 in a production build, signed in or not; open in development. */
afterEach(() => vi.unstubAllEnvs());
const req = (path: string, cookie?: string) =>
  new NextRequest(`https://tribelatam.com${path}`, cookie ? { headers: { cookie } } : undefined);

describe('/dev pages in middleware', () => {
  it.each(['/dev/feed/', '/dev/feed', '/dev/bridge/', '/dev/'])(
    '%s is a 404 in production, signed out or in',
    async (path) => {
      vi.stubEnv('NODE_ENV', 'production');
      expect((await middleware(req(path))).status).toBe(404);
      expect((await middleware(req(path, 'sb-x-auth-token=1'))).status).toBe(404);
    }
  );

  it('does not touch look-alike paths', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await middleware(req('/devices/'))).status).not.toBe(404);
  });

  it('opens /dev/feed signed out in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await middleware(req('/dev/feed/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
