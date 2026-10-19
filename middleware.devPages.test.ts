import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { isPublicPath, middleware } from './middleware';

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

describe('session photo screens need an account (T-MOM1)', () => {
  it('signed out, /session/<id>/fotos/subir/ is a redirect to sign-in, not a 200', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await middleware(req('/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/fotos/subir/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/auth?returnTo=');
  });

  it('the session page itself stays public', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isPublicPath('/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/')).toBe(true);
    expect(isPublicPath('/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/fotos/subir/')).toBe(false);
    // T-MOM1 Part C: the claim link is public (the person has no account yet); its
    // claim step and the photographer screen are not, and /messages is untouched.
    expect(isPublicPath('/m/Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z/')).toBe(true);
    expect(isPublicPath('/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/fotos/fotografos/')).toBe(false);
    expect(isPublicPath('/messages/')).toBe(false);
    expect(isPublicPath('/profile/momentos/')).toBe(false);
  });
});
