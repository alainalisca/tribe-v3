import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * POST /api/attr/signup (T-GROW1 part C).
 *
 * The arms with weight are the ones where writing would be WRONG: signed out,
 * an account too old to credit, a touch shaped like the OAuth callback, and a
 * body that names someone else's user id. Each asserts on what reached the DAL,
 * not only on the status, because a route that answers 200 and writes the wrong
 * row looks identical from the outside.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/dal/signupAttribution', () => ({
  fetchUserCreatedAt: vi.fn(),
  recordSignupAttribution: vi.fn(),
}));
vi.mock('@/lib/dal/referralLinks', () => ({ linkSignupReferral: vi.fn() }));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { fetchUserCreatedAt, recordSignupAttribution } from '@/lib/dal/signupAttribution';
import { logError } from '@/lib/logger';
import { linkSignupReferral } from '@/lib/dal/referralLinks';
import { SIGNUP_WINDOW_MS } from '@/lib/signupAttribution';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function signedIn(id: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: id ? { id } : null }, error: null }) },
  } as never);
}

function request(payload: unknown): NextRequest {
  return new NextRequest('https://tribelatam.com/api/attr/signup/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

const now = Date.now();
const LAST = {
  src: 'runclub',
  code: 'runclub-sat0927',
  ref: 'a7k2qx',
  utm_source: 'WhatsApp',
  utm_medium: null,
  utm_campaign: 'hyrox-oct',
  utm_content: null,
  landing_path: '/pase/bullbox/?src=runclub',
  ts: now - 600_000,
};
const FIRST = { ...LAST, src: 'ig', code: 'IG-REEL-01', ts: now - 86_400_000 };

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(USER_ID);
  vi.mocked(getServiceRoleClient).mockReturnValue({} as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
  vi.mocked(fetchUserCreatedAt).mockResolvedValue({ success: true, data: now - 60_000 });
  vi.mocked(recordSignupAttribution).mockResolvedValue({ success: true, data: 'recorded' });
  vi.mocked(linkSignupReferral).mockResolvedValue({ success: true, data: 'linked' });
});

describe('POST /api/attr/signup', () => {
  it('records the sanitized last touch on the SESSION user, with the window in the WHERE clause', async () => {
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(res.status).toBe(200);
    // LAST carries ref a7k2qx, so T-GROW2 links the referral on this call.
    expect(await res.json()).toEqual({ status: 'recorded', referral: 'linked' });

    const [, userId, fields, createdAfter] = vi.mocked(recordSignupAttribution).mock.calls[0];
    expect(userId).toBe(USER_ID);
    // Through the shared sanitizers: casing normalised, query string stripped.
    expect(fields).toMatchObject({
      signup_src: 'runclub',
      signup_code: 'RUNCLUB-SAT0927',
      signup_ref: 'A7K2QX',
      signup_utm_source: 'whatsapp',
      signup_landing_path: '/pase/bullbox/',
    });
    expect(fields.signup_first_touch).toMatchObject({ src: 'ig', code: 'IG-REEL-01' });
    // The window is restated in the write itself, within a second of now - 7 days.
    expect(Math.abs(new Date(createdAfter).getTime() - (Date.now() - SIGNUP_WINDOW_MS))).toBeLessThan(1000);
  });

  it('refuses a signed-out caller and writes nothing', async () => {
    signedIn(null);
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(res.status).toBe(401);
    expect(recordSignupAttribution).not.toHaveBeenCalled();
    expect(fetchUserCreatedAt).not.toHaveBeenCalled();
  });

  it('ignores any user id in the body: the row is always the session user', async () => {
    await POST(request({ first: FIRST, last: LAST, user_id: OTHER_ID, userId: OTHER_ID }));
    expect(vi.mocked(fetchUserCreatedAt).mock.calls[0][1]).toBe(USER_ID);
    expect(vi.mocked(recordSignupAttribution).mock.calls[0][1]).toBe(USER_ID);
  });

  it('writes nothing for an account older than the window', async () => {
    vi.mocked(fetchUserCreatedAt).mockResolvedValue({ success: true, data: now - SIGNUP_WINDOW_MS - 60_000 });
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(await res.json()).toEqual({ status: 'too_old' });
    expect(recordSignupAttribution).not.toHaveBeenCalled();
  });

  it('refuses a touch captured on the OAuth callback, and never stores a UUID-shaped code', async () => {
    const callback = { ...LAST, landing_path: '/auth/callback/' };
    const res = await POST(request({ first: null, last: callback }));
    expect(await res.json()).toEqual({ status: 'none' });
    expect(recordSignupAttribution).not.toHaveBeenCalled();

    const uuidCode = { ...LAST, code: 'ff275d19-1c2b-4f2a-9d3e-7a1b2c3d4e5f' };
    await POST(request({ first: null, last: uuidCode }));
    expect(vi.mocked(recordSignupAttribution).mock.calls[0][2].signup_code).toBeNull();
  });

  it('passes "already" through when the row was written before', async () => {
    vi.mocked(recordSignupAttribution).mockResolvedValue({ success: true, data: 'already' });
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(await res.json()).toEqual({ status: 'already' });
  });

  it('answers 500 on a failed write, so the client tries again next sign-in', async () => {
    vi.mocked(recordSignupAttribution).mockResolvedValue({ success: false, error: 'boom' });
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(res.status).toBe(500);
  });

  it('logs an exception it did not expect, rather than swallowing it', async () => {
    vi.mocked(fetchUserCreatedAt).mockRejectedValue(new Error('network'));
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(res.status).toBe(500);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ route: '/api/attr/signup' }));
  });

  it('answers "none" when the account has no users row, and writes nothing', async () => {
    vi.mocked(fetchUserCreatedAt).mockResolvedValue({ success: true, data: null });
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(await res.json()).toEqual({ status: 'none' });
    expect(recordSignupAttribution).not.toHaveBeenCalled();
  });

  it('refuses malformed JSON and a non-object body', async () => {
    expect((await POST(request('{nope'))).status).toBe(400);
    expect((await POST(request([FIRST]))).status).toBe(400);
    expect(recordSignupAttribution).not.toHaveBeenCalled();
  });

  it('rate limits per user', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await POST(request({ first: FIRST, last: LAST }));
    expect(res.status).toBe(429);
    expect(vi.mocked(checkRateLimit).mock.calls[0][1]).toBe(`attr-signup:${USER_ID}`);
    expect(recordSignupAttribution).not.toHaveBeenCalled();
  });

  describe('T-GROW2: crediting the referrer', () => {
    it('links the uppercased ref to the SESSION user, on the call that recorded', async () => {
      await POST(request({ first: FIRST, last: LAST, user_id: OTHER_ID }));
      expect(linkSignupReferral).toHaveBeenCalledTimes(1);
      const [, code, userId] = vi.mocked(linkSignupReferral).mock.calls[0];
      expect(code).toBe('A7K2QX');
      expect(userId).toBe(USER_ID);
    });

    it('does NOT link when the attribution was already recorded by an earlier call', async () => {
      vi.mocked(recordSignupAttribution).mockResolvedValue({ success: true, data: 'already' });
      const res = await POST(request({ first: FIRST, last: LAST }));
      expect(await res.json()).toEqual({ status: 'already' });
      expect(linkSignupReferral).not.toHaveBeenCalled();
    });

    it('does NOT link when the touch carries no ref', async () => {
      await POST(request({ first: null, last: { ...LAST, ref: null } }));
      expect(recordSignupAttribution).toHaveBeenCalledTimes(1);
      expect(linkSignupReferral).not.toHaveBeenCalled();
    });

    it('a failed link does not fail the request: the attribution is already recorded', async () => {
      vi.mocked(linkSignupReferral).mockResolvedValue({ success: false, error: 'db' });
      const res = await POST(request({ first: FIRST, last: LAST }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'recorded', referral: 'error' });
    });
  });
});

