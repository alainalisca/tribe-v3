import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { middleware, isPublicPath } from './middleware';
import { GATED_NOT_FOUND_PATH } from '@/lib/features/athleteValueGate';
import { readAttributionFromUrl } from '@/lib/attribution';

/**
 * T-POLISH1 PR 3b-0: a signed-out visitor to /storefront/<id>/ goes to the
 * public /g/ or /i/ page with the query string whole; a signed-in visitor keeps
 * today's storefront. Supabase is a mocked fetch: nothing reaches a database.
 */
const COACH = '11111111-1111-4111-8111-111111111111';
const GYM_OWNER = '22222222-2222-4222-8222-222222222222';
const ATHLETE = '33333333-3333-4333-8333-333333333333';
const TEST_COACH = '44444444-4444-4444-8444-444444444444';
const BANNED = '55555555-5555-4555-8555-555555555555';
const DELETED = '66666666-6666-4666-8666-666666666666';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const GYM_NO_SLUG_OWNER = '77777777-7777-4777-8777-777777777777';
const TEST_GYM_OWNER = '88888888-8888-4888-8888-888888888888';

const live = { is_instructor: true, is_test_account: false, banned: false, deleted_at: null };
const USERS: Record<string, object> = {
  [COACH]: live,
  [GYM_OWNER]: { ...live, is_instructor: false },
  [GYM_NO_SLUG_OWNER]: live,
  [ATHLETE]: { ...live, is_instructor: false },
  [TEST_COACH]: { ...live, is_test_account: true },
  [TEST_GYM_OWNER]: { ...live, is_test_account: true },
  [BANNED]: { ...live, banned: true },
  [DELETED]: { ...live, deleted_at: '2026-10-01T00:00:00Z' },
};
// What the anon key sees: active gyms and studios only (RLS + the query's own filters).
const GYMS: Record<string, { id: string; slug: string | null }> = {
  [GYM_OWNER]: { id: 'aaaaaaaa-0000-4000-8000-00000000000a', slug: 'bullbox' },
  [GYM_NO_SLUG_OWNER]: { id: 'bbbbbbbb-0000-4000-8000-00000000000b', slug: null },
  [TEST_GYM_OWNER]: { id: 'cccccccc-0000-4000-8000-00000000000c', slug: 'pruebas' },
};

let failReads = false;
const fetchMock = vi.fn(async (input: string) => {
  const url = new URL(input);
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (failReads) return new Response('down', { status: 503 });
  if (url.pathname === '/rest/v1/users') {
    const id = (url.searchParams.get('id') ?? '').replace('eq.', '');
    const handle = (url.searchParams.get('handle') ?? '').replace('eq.', '');
    const row = USERS[id] ?? (handle === 'salotaba' ? live : undefined);
    return ok(row ? [row] : []);
  }
  if (url.pathname === '/rest/v1/featured_partners') {
    expect(url.searchParams.get('status')).toBe('eq.active');
    expect(url.searchParams.get('business_type')).toBe('in.(gym,studio)');
    const row = GYMS[(url.searchParams.get('user_id') ?? '').replace('eq.', '')];
    return ok(row ? [row] : []);
  }
  return new Response('not mocked', { status: 500 });
});

const token = (sub: string) =>
  `h.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.s`;
const signedInCookie = `sb-ref-auth-token=${encodeURIComponent(
  JSON.stringify({ access_token: token('viewer'), refresh_token: 'r' })
)}`;
const req = (path: string, cookie?: string) =>
  new NextRequest(`https://tribelatam.com${path}`, cookie ? { headers: { cookie } } : undefined);
const locationOf = (res: Response) => new URL(res.headers.get('location') ?? 'https://none.invalid/');

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://db.example.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  getUser.mockReset();
  failReads = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('signed out: /storefront goes to its public page, query whole', () => {
  it('a coach goes to /i/<id>/ with a 307', async () => {
    const res = await middleware(req(`/storefront/${COACH}/?src=test&code=TEST`));
    expect(res.status).toBe(307);
    expect(locationOf(res).pathname).toBe(`/i/${COACH}/`);
    expect(locationOf(res).search).toBe('?src=test&code=TEST');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('every attribution parameter arrives unchanged, in order, with anything else on the URL', async () => {
    const search =
      '?src=poster&code=BULLBOX-01&ref=ANA7&utm_source=ig&utm_medium=story&utm_campaign=hyrox-oct&utm_content=a%20b&tab=sessions';
    const res = await middleware(req(`/storefront/${COACH}/${search}`));
    expect(res.status).toBe(307);
    expect(locationOf(res).search).toBe(search);
  });

  it('src and code are read on /i exactly as AttributionCapture will read them', async () => {
    const res = await middleware(req(`/storefront/${COACH}/?src=test&code=TEST`));
    const landed = locationOf(res);
    const attr = readAttributionFromUrl(landed.search, landed.pathname, 0);
    expect(attr).toMatchObject({ src: 'test', code: 'TEST', landing_path: `/i/${COACH}/` });
    // And /i lets the visitor through with the query intact (no second redirect).
    const onward = await middleware(req(`${landed.pathname}${landed.search}`));
    expect(onward.status).toBe(200);
    expect(onward.headers.get('location')).toBeNull();
  });

  it('a gym (or studio) owner goes to /g/<slug>/', async () => {
    const res = await middleware(req(`/storefront/${GYM_OWNER}/?src=pase&code=BULLBOX`));
    expect(res.status).toBe(307);
    expect(locationOf(res).pathname).toBe('/g/bullbox/');
    expect(locationOf(res).search).toBe('?src=pase&code=BULLBOX');
  });

  it('a gym with no slug goes to /g/<partner id>/, which /g accepts', async () => {
    const res = await middleware(req(`/storefront/${GYM_NO_SLUG_OWNER}/`));
    expect(locationOf(res).pathname).toBe(`/g/${GYMS[GYM_NO_SLUG_OWNER].id}/`);
  });

  it('works without the trailing slash, and with an upper-case id', async () => {
    const res = await middleware(req(`/storefront/${COACH.toUpperCase()}?src=x`));
    expect(res.status).toBe(307);
    expect(locationOf(res).pathname).toBe(`/i/${COACH}/`);
    expect(locationOf(res).search).toBe('?src=x');
  });

  it('is never cached for anyone else', async () => {
    const res = await middleware(req(`/storefront/${COACH}/?src=test&code=TEST`));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('vary')).toContain('Cookie');
  });
});

describe('signed out: a 404 wherever /i would 404 (and for an athlete, who has no storefront)', () => {
  it.each([
    ['an athlete', ATHLETE],
    ['a test account (coach)', TEST_COACH],
    ['a test account that owns a gym', TEST_GYM_OWNER],
    ['a banned account', BANNED],
    ['a deleted account', DELETED],
    ['an unknown id', UNKNOWN],
    ['a malformed id', 'not-a-uuid'],
  ])('%s', async (_label, id) => {
    const res = await middleware(req(`/storefront/${id}/?src=test&code=TEST`));
    expect(res.status).toBe(404);
    expect(res.headers.get('x-middleware-rewrite')).toContain(GATED_NOT_FOUND_PATH);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("signed in: today's storefront, untouched", () => {
  it('a visitor with a Supabase auth cookie is not redirected and reaches the page', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'viewer' } } });
    const res = await middleware(req(`/storefront/${COACH}/?src=test&code=TEST`, signedInCookie));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    // No storefront lookups for a signed-in visitor.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an expired session cookie keeps today's behaviour too (the auth gate decides)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(req(`/storefront/${COACH}/?src=test`, signedInCookie));
    expect(res.headers.get('location')).toContain('/auth?returnTo=');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('a lookup that fails changes nothing', () => {
  it('falls through to the auth gate, as today', async () => {
    failReads = true;
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(req(`/storefront/${COACH}/?src=test&code=TEST`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain(
      `/auth?returnTo=${encodeURIComponent(`/storefront/${COACH}/?src=test&code=TEST`)}`
    );
  });
});

describe('the pin: /storefront is NOT a public page', () => {
  it('stays behind the auth gate for everyone the redirect does not take', () => {
    expect(isPublicPath('/storefront')).toBe(false);
    expect(isPublicPath(`/storefront/${COACH}/`)).toBe(false);
  });

  it('only the page path is redirected, nothing under it', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(req(`/storefront/${COACH}/extra/`));
    expect(res.headers.get('location')).toContain('/auth?returnTo=');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
