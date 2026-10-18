import { describe, it, expect, vi } from 'vitest';
import {
  accessTokenFromCookies,
  coachVerdict,
  gateTargetFor,
  hostOrAdminVerdict,
  readGateRow,
  sessionVerdict,
} from './publicPageGate';

/**
 * T-SSR1: the middleware's 404 decision for public session and coach pages.
 * Every fetch here is a mock: nothing reaches Supabase.
 */
const ID = 'cfcafad0-80ec-43ea-a018-eafcf99c8648';
const HOST = 'eaff348f-0000-4000-8000-000000000001';
const ENV = { url: 'https://db.example.co/', anonKey: 'anon' };

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
const NOW = 1_800_000_000;
const mockFetch = (impl: (url: string) => Response) => vi.fn<typeof fetch>(async (input) => impl(String(input)));
const urlOf = (fetcher: ReturnType<typeof mockFetch>, call: number) => String(fetcher.mock.calls[call][0]);

describe('gateTargetFor', () => {
  it('checks only the session and coach page paths', () => {
    expect(gateTargetFor(`/session/${ID}/`)).toEqual({ kind: 'session', id: ID });
    expect(gateTargetFor(`/session/${ID.toUpperCase()}`)).toEqual({ kind: 'session', id: ID });
    expect(gateTargetFor('/i/salotaba/')).toEqual({ kind: 'coach', key: 'salotaba' });
    expect(gateTargetFor('/i/sal%C3%B3/')).toEqual({ kind: 'coach', key: 'saló' });
    for (const path of [
      `/session/${ID}/card/`,
      `/session/${ID}/edit/`,
      `/session/${ID}/chat/`,
      '/i/salotaba/card/',
      '/session/',
      '/sessions/',
      '/',
      '/coaches/',
    ]) {
      expect(gateTargetFor(path)).toBeNull();
    }
  });

  it('answers a malformed id or handle as not found without a read', () => {
    expect(gateTargetFor('/session/not-a-uuid/')).toEqual({ kind: 'notFound' });
    expect(gateTargetFor('/i/%E0%A4%A/')).toEqual({ kind: 'notFound' });
  });
});

describe('verdicts', () => {
  it('sessions: unknown and test sessions are hidden from a signed-out visitor', () => {
    expect(sessionVerdict(null, false)).toBe('hide');
    expect(sessionVerdict({ is_test: true, creator_id: HOST }, false)).toBe('hide');
    expect(sessionVerdict({ is_test: false, creator_id: HOST }, false)).toBe('show');
    expect(sessionVerdict({ is_test: null, creator_id: HOST }, false)).toBe('show');
  });

  it('sessions: signed in, an unknown id is the page’s call and a test session asks who', () => {
    expect(sessionVerdict(null, true)).toBe('show');
    expect(sessionVerdict({ is_test: true, creator_id: HOST }, true)).toBe('ask');
    expect(sessionVerdict({ is_test: false, creator_id: HOST }, true)).toBe('show');
  });

  it('coaches: only a listed coach', () => {
    const listed = { is_instructor: true, is_test_account: false, banned: false, deleted_at: null };
    expect(coachVerdict(listed)).toBe('show');
    expect(coachVerdict(null)).toBe('hide');
    expect(coachVerdict({ ...listed, is_instructor: false })).toBe('hide');
    expect(coachVerdict({ ...listed, is_test_account: true })).toBe('hide');
    expect(coachVerdict({ ...listed, banned: true })).toBe('hide');
    expect(coachVerdict({ ...listed, deleted_at: '2026-10-01T00:00:00Z' })).toBe('hide');
  });
});

describe('readGateRow', () => {
  it('reads one session row from the public view by id', async () => {
    const fetcher = mockFetch(() => json([{ is_test: true, creator_id: HOST }]));
    expect(await readGateRow({ kind: 'session', id: ID }, ENV, fetcher)).toEqual({ is_test: true, creator_id: HOST });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://db.example.co/rest/v1/sessions_public?select=is_test,creator_id&id=eq.${ID}&limit=1`);
    expect((init!.headers as Record<string, string>).apikey).toBe('anon');
  });

  it('reads a coach by handle (normalised) or by id', async () => {
    const fetcher = mockFetch(() => json([]));
    expect(await readGateRow({ kind: 'coach', key: 'SaloTaba' }, ENV, fetcher)).toBeNull();
    expect(urlOf(fetcher, 0)).toContain(
      'users?select=is_instructor,is_test_account,banned,deleted_at&handle=eq.salotaba&limit=1'
    );
    await readGateRow({ kind: 'coach', key: HOST.toUpperCase() }, ENV, fetcher);
    expect(urlOf(fetcher, 1)).toContain(`&id=eq.${HOST}&limit=1`);
  });

  it('fails open without the Supabase env, and reads nothing', async () => {
    const fetcher = mockFetch(() => json([]));
    expect(await readGateRow({ kind: 'session', id: ID }, { url: '', anonKey: '' }, fetcher)).toBe('error');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails open: an error status or a throw is "error", never a 404', async () => {
    expect(await readGateRow({ kind: 'session', id: ID }, ENV, async () => json({}, false))).toBe('error');
    expect(
      await readGateRow({ kind: 'session', id: ID }, ENV, async () => {
        throw new Error('timeout');
      })
    ).toBe('error');
  });
});

describe('accessTokenFromCookies', () => {
  const token = jwt({ sub: HOST, exp: NOW + 600 });
  const session = JSON.stringify({ access_token: token, refresh_token: 'r' });

  it('reads a whole or chunked session cookie', () => {
    expect(accessTokenFromCookies([{ name: 'sb-ref-auth-token', value: session }], NOW)).toBe(token);
    const half = Math.floor(session.length / 2);
    const chunks = [
      { name: 'sb-ref-auth-token.1', value: session.slice(half) },
      { name: 'sb-ref-auth-token.0', value: session.slice(0, half) },
    ];
    expect(accessTokenFromCookies(chunks, NOW)).toBe(token);
    const b64 = `base64-${Buffer.from(session).toString('base64')}`;
    expect(accessTokenFromCookies([{ name: 'sb-ref-auth-token', value: b64 }], NOW)).toBe(token);
  });

  it('is null when absent, unreadable or expired (never refreshed here)', () => {
    expect(accessTokenFromCookies([{ name: 'tribe_lang', value: 'es' }], NOW)).toBeNull();
    expect(accessTokenFromCookies([{ name: 'sb-ref-auth-token', value: 'garbage' }], NOW)).toBeNull();
    const expired = JSON.stringify({ access_token: jwt({ sub: HOST, exp: NOW - 1 }) });
    expect(accessTokenFromCookies([{ name: 'sb-ref-auth-token', value: expired }], NOW)).toBeNull();
  });
});

describe('hostOrAdminVerdict', () => {
  const row = { is_test: true, creator_id: HOST };

  it('shows the host without asking about admin', async () => {
    const fetcher = mockFetch(() => json({ id: HOST }));
    expect(await hostOrAdminVerdict(row, 'tok', ENV, fetcher)).toBe('show');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(urlOf(fetcher, 0)).toBe('https://db.example.co/auth/v1/user');
  });

  it('asks is_app_admin() as the visitor for anyone else', async () => {
    const admin = mockFetch((url) => (url.endsWith('/auth/v1/user') ? json({ id: 'someone' }) : json(true)));
    expect(await hostOrAdminVerdict(row, 'tok', ENV, admin)).toBe('show');
    expect(urlOf(admin, 1)).toBe('https://db.example.co/rest/v1/rpc/is_app_admin');
    const stranger = mockFetch((url) => (url.endsWith('/auth/v1/user') ? json({ id: 'someone' }) : json(false)));
    expect(await hostOrAdminVerdict(row, 'tok', ENV, stranger)).toBe('hide');
  });

  it('lets the page decide when unsure', async () => {
    const never = vi.fn<typeof fetch>();
    expect(await hostOrAdminVerdict(row, null, ENV, never)).toBe('show');
    expect(never).not.toHaveBeenCalled();
    expect(await hostOrAdminVerdict(row, 'tok', ENV, async () => json({}, false))).toBe('show');
    expect(
      await hostOrAdminVerdict(row, 'tok', ENV, async () => {
        throw new Error('down');
      })
    ).toBe('show');
  });
});
