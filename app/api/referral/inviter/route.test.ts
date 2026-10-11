import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockLookup = vi.fn();
const mockRateLimit = vi.fn();
const mockLogError = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({ tag: 'admin' }) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => mockRateLimit(...a) }));
vi.mock('@/lib/dal/referralInviter', () => ({ lookupInviterFirstName: (...a: unknown[]) => mockLookup(...a) }));
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => mockLogError(...a) }));

import { GET } from './route';

function req(code: string | null, ip = '1.2.3.4') {
  const url =
    code === null
      ? 'https://tribelatam.com/api/referral/inviter/'
      : `https://tribelatam.com/api/referral/inviter/?code=${encodeURIComponent(code)}`;
  return new NextRequest(url, { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } });
}

describe('GET /api/referral/inviter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ allowed: true });
    mockLookup.mockResolvedValue({ success: true, data: 'Ana' });
  });

  it('answers a signed-out visitor with the first name and nothing else', async () => {
    // No auth mock exists in this file: the route must not need one.
    const res = await GET(req('tribe-ab2cd'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ firstName: 'Ana' });
    // Upper-cased before lookup, so a hand-typed lowercase link still works.
    expect(mockLookup).toHaveBeenCalledWith({ tag: 'admin' }, 'TRIBE-AB2CD');
  });

  it('answers an unknown code exactly like a nameless owner: firstName null', async () => {
    mockLookup.mockResolvedValue({ success: true, data: null });
    const res = await GET(req('TRIBE-ZZZZZ'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ firstName: null });
  });

  it('refuses a missing or oversized code without a lookup', async () => {
    for (const r of [req(null), req(''), req('X'.repeat(21))]) {
      expect((await GET(r)).status).toBe(400);
    }
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('rate-limits per client IP and does not look up when limited', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false });
    const res = await GET(req('TRIBE-AB2CD', '9.9.9.9'));
    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith({ tag: 'admin' }, 'referral-inviter:9.9.9.9', 30, 60_000);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('logs a lookup failure and answers 500 without the reason', async () => {
    mockLookup.mockResolvedValue({ success: false, error: 'permission denied for table referrals' });
    const res = await GET(req('TRIBE-AB2CD'));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('permission');
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'permission denied for table referrals' }),
      {
        action: 'api.referral.inviter',
      }
    );
  });
});
