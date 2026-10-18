import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { middleware } from './middleware';
import { GATED_NOT_FOUND_PATH } from '@/lib/features/athleteValueGate';

/**
 * T-SSR1: hidden public pages answer a real HTTP 404 from middleware, before
 * anything streams. Supabase is a mocked fetch: nothing here reaches a database.
 */
const PUBLIC = 'cfcafad0-80ec-43ea-a018-eafcf99c8648';
const CANCELLED = '2732b077-f6e8-4a65-ab84-04fe69edb13a';
const TEST = 'd167ea37-1ff3-40d1-b9ea-1c91f2e491f1';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const HOST = 'eaff348f-0000-4000-8000-000000000001';

const SESSIONS: Record<string, { is_test: boolean; creator_id: string }> = {
  [PUBLIC]: { is_test: false, creator_id: 'c1' },
  // Cancelled sessions stay in the public view: the page says "Esta sesión fue cancelada".
  [CANCELLED]: { is_test: false, creator_id: 'c2' },
  [TEST]: { is_test: true, creator_id: HOST },
};
const COACHES: Record<string, object> = {
  salotaba: { is_instructor: true, is_test_account: false, banned: false, deleted_at: null },
  atleta: { is_instructor: false, is_test_account: false, banned: false, deleted_at: null },
  pruebas: { is_instructor: true, is_test_account: true, banned: false, deleted_at: null },
};

let viewer: { id: string; admin: boolean } | null = null;
const fetchMock = vi.fn(async (input: string) => {
  const url = new URL(input);
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (url.pathname === '/rest/v1/sessions_public') {
    const row = SESSIONS[(url.searchParams.get('id') ?? '').replace('eq.', '')];
    return ok(row ? [row] : []);
  }
  if (url.pathname === '/rest/v1/users') {
    const row = COACHES[(url.searchParams.get('handle') ?? '').replace('eq.', '')];
    return ok(row ? [row] : []);
  }
  if (url.pathname === '/auth/v1/user') return viewer ? ok({ id: viewer.id }) : new Response('{}', { status: 401 });
  if (url.pathname === '/rest/v1/rpc/is_app_admin') return ok(viewer?.admin === true);
  return new Response('not mocked', { status: 500 });
});

const token = (sub: string) =>
  `h.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.s`;
const signedIn = (sub: string) =>
  `sb-ref-auth-token=${encodeURIComponent(JSON.stringify({ access_token: token(sub), refresh_token: 'r' }))}`;
const req = (path: string, cookie?: string) =>
  new NextRequest(`https://tribelatam.com${path}`, cookie ? { headers: { cookie } } : undefined);
const rewriteOf = (res: Response) => res.headers.get('x-middleware-rewrite');

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  getUser.mockReset();
  viewer = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('hidden public pages are a real 404 (T-SSR1)', () => {
  it.each([
    ['a test session, signed out', `/session/${TEST}/`],
    ['an unknown session id, signed out', `/session/${UNKNOWN}/`],
    ['a malformed session id', '/session/nope/'],
    ['an unlisted /i/ page (not a coach)', '/i/atleta/'],
    ['an unlisted /i/ page (test account)', '/i/pruebas/'],
    ['an unknown /i/ handle', '/i/nadie/'],
  ])('%s', async (_label, path) => {
    const res = await middleware(req(path));
    expect(res.status).toBe(404);
    // The rewrite target matches no route: Next renders app/not-found.tsx.
    expect(new URL(rewriteOf(res)!).pathname).toBe(GATED_NOT_FOUND_PATH);
    expect(res.headers.get('Server-Timing')).toMatch(/^tribe-gate;dur=\d+$/);
  });

  it.each([
    ['a public session', `/session/${PUBLIC}/`],
    ['a cancelled session', `/session/${CANCELLED}/`],
    ['a listed coach', '/i/salotaba/'],
  ])('%s is a 200', async (_label, path) => {
    const res = await middleware(req(path));
    expect(res.status).toBe(200);
    expect(rewriteOf(res)).toBeNull();
    expect(res.headers.get('Server-Timing')).toMatch(/^tribe-gate;dur=\d+$/);
  });

  it('costs one read and never a supabase client for signed-out visitors', async () => {
    await middleware(req(`/session/${PUBLIC}/`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('does not check cards, edit or chat', async () => {
    for (const path of [`/session/${TEST}/card/`, '/i/atleta/card/']) {
      const res = await middleware(req(path));
      expect(res.status).toBe(200);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a read that fails lets the page through', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('down', { status: 503 }));
    expect((await middleware(req(`/session/${TEST}/`))).status).toBe(200);
  });
});

describe('test sessions signed in (T-SSR1)', () => {
  it('the host gets the page (with its "Sesión de prueba" note)', async () => {
    viewer = { id: HOST, admin: false };
    const res = await middleware(req(`/session/${TEST}/`, signedIn(HOST)));
    expect(res.status).toBe(200);
    // Session read + who-am-I; the host is never asked about admin.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an admin gets the page', async () => {
    viewer = { id: 'admin-1', admin: true };
    expect((await middleware(req(`/session/${TEST}/`, signedIn('admin-1')))).status).toBe(200);
  });

  it('anyone else signed in gets the 404', async () => {
    viewer = { id: 'someone', admin: false };
    expect((await middleware(req(`/session/${TEST}/`, signedIn('someone')))).status).toBe(404);
  });

  it('signed in, a public session costs only the one read', async () => {
    viewer = { id: 'someone', admin: false };
    expect((await middleware(req(`/session/${PUBLIC}/`, signedIn('someone')))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signed in, an id outside the public view is the page’s call (invite-only)', async () => {
    viewer = { id: 'someone', admin: false };
    expect((await middleware(req(`/session/${UNKNOWN}/`, signedIn('someone')))).status).toBe(200);
  });

  it('never refreshes the session: an expired token lets the page decide', async () => {
    const expired = `h.${Buffer.from(JSON.stringify({ sub: 'x', exp: 1 })).toString('base64url')}.s`;
    const cookie = `sb-ref-auth-token=${encodeURIComponent(JSON.stringify({ access_token: expired }))}`;
    const res = await middleware(req(`/session/${TEST}/`, cookie));
    expect(res.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
