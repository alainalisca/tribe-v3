import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { middleware } from './middleware';

/**
 * T-PLAN1: while COACH_PLANS_ENABLED is off, /planes is a real 404 (status, not
 * just the not-found screen), signed out or in, as it was before the page
 * existed. With the flag on it is a public page.
 */
afterEach(() => vi.unstubAllEnvs());
const req = (path: string, cookie?: string) =>
  new NextRequest(`https://tribelatam.com${path}`, cookie ? { headers: { cookie } } : undefined);

describe('/planes in middleware', () => {
  it.each(['/planes/', '/planes', '/planes/?plan=pro'])('%s is a 404 while the flag is off', async (path) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'false');
    expect((await middleware(req(path))).status).toBe(404);
    expect((await middleware(req(path, 'sb-x-auth-token=1'))).status).toBe(404);
  });

  it('is a public page with the flag on (no 404, no sign-in redirect)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'true');
    const res = await middleware(req('/planes/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('does not touch look-alike paths', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'false');
    expect((await middleware(req('/planesx/'))).status).not.toBe(404);
  });
});
