import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * T-JOIN1 Part B: the guest join route, the one door in front of
 * join_session_as_guest. Name and WhatsApp only, E.164, 5 joins per IP per
 * hour, one join per phone per session. The RPC is mocked: nothing here
 * touches a database.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./notifyHost', () => ({ notifyHostOfGuest: vi.fn(async () => {}) }));

import { GUEST_JOINS_PER_IP_PER_HOUR, POST } from './route';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { notifyHostOfGuest } from './notifyHost';

const SESSION = 'f8230509-9aa3-4a79-98e4-afa7b6e695ef';

function makeService({ existing = [] as { id: string }[], rpc = { data: {}, error: null } as unknown } = {}) {
  const eqs: [string, unknown][] = [];
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return chain;
    }),
    limit: vi.fn(async () => ({ data: existing, error: null })),
  };
  const service = {
    from: vi.fn(() => chain),
    rpc: vi.fn(async () => rpc),
  };
  vi.mocked(getServiceRoleClient).mockReturnValue(service as never);
  return { service, eqs };
}

function req(body: unknown, ip = '190.0.0.1') {
  return new NextRequest(`http://localhost/api/sessions/${SESSION}/guest/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const ctx = (id = SESSION) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
});

describe('POST /api/sessions/[id]/guest', () => {
  it('joins with the phone as E.164 and returns the guest token', async () => {
    const { service } = makeService({
      rpc: {
        data: { success: true, participant_id: 'p1', guest_token: 'tok-1', status: 'confirmed' },
        error: null,
      },
    });
    const res = await POST(req({ name: '  Ana  ', phone: '300 123 4567' }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      participant_id: 'p1',
      guest_token: 'tok-1',
      status: 'confirmed',
    });
    expect(service.rpc).toHaveBeenCalledWith('join_session_as_guest', {
      p_session_id: SESSION,
      p_invite_token: null,
      p_guest_name: 'Ana',
      p_guest_phone: '+573001234567',
      p_guest_email: null,
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    // The host hears of it from the server, not from the guest's browser.
    expect(notifyHostOfGuest).toHaveBeenCalledWith(service, SESSION, 'Ana');
  });

  it('passes an invite token through', async () => {
    const { service } = makeService({ rpc: { data: { success: true, participant_id: 'p1' }, error: null } });
    await POST(req({ name: 'Ana', phone: '+57 300 123 4567', inviteToken: 'abc' }), ctx());
    expect(service.rpc).toHaveBeenCalledWith(
      'join_session_as_guest',
      expect.objectContaining({ p_invite_token: 'abc' })
    );
  });

  it('accepts an international number with its country code', async () => {
    const { service } = makeService({ rpc: { data: { success: true, participant_id: 'p1' }, error: null } });
    const res = await POST(req({ name: 'Joe', phone: '+1 (305) 555-0142' }), ctx());
    expect(res.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith(
      'join_session_as_guest',
      expect.objectContaining({ p_guest_phone: '+13055550142' })
    );
  });

  it.each([
    ['a Colombian landline', '604 444 5555'],
    ['too short', '300 123'],
    ['letters', 'llámame'],
    ['empty', ''],
  ])('refuses %s with 400 invalid_phone and spends no attempt', async (_label, phone) => {
    const { service } = makeService();
    const res = await POST(req({ name: 'Ana', phone }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_phone');
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('refuses a missing or over-long name', async () => {
    makeService();
    expect((await POST(req({ name: ' ', phone: '3001234567' }), ctx())).status).toBe(400);
    expect((await POST(req({ name: 'x'.repeat(81), phone: '3001234567' }), ctx())).status).toBe(400);
  });

  it('refuses a session id that is not a UUID, and bad JSON', async () => {
    makeService();
    expect((await POST(req({ name: 'Ana', phone: '3001234567' }), ctx('nope'))).status).toBe(400);
    expect((await POST(req('{not json'), ctx())).status).toBe(400);
  });

  it(`rate-limits ${GUEST_JOINS_PER_IP_PER_HOUR} joins per IP per hour, keyed on the first forwarded address`, async () => {
    const { service } = makeService();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);
    const res = await POST(req({ name: 'Ana', phone: '3001234567' }, '181.1.2.3'), ctx());
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate_limited');
    expect(checkRateLimit).toHaveBeenCalledWith(service, 'guest-join:181.1.2.3', 5, 60 * 60 * 1000);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('refuses a second join with the same phone on the same session (409 already_joined)', async () => {
    const { service, eqs } = makeService({ existing: [{ id: 'p0' }] });
    const res = await POST(req({ name: 'Ana', phone: '3001234567' }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_joined');
    expect(eqs).toEqual([
      ['session_id', SESSION],
      ['is_guest', true],
      ['guest_phone', '+573001234567'],
    ]);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['already_joined', 409, 'already_joined'],
    ['Session is full', 409, 'session_full'],
    ['invite_required', 403, 'invite_required'],
    ['session_not_found', 404, 'session_not_found'],
    ['something new', 400, 'join_failed'],
  ])('maps the RPC refusal %s to %i %s', async (rpcError, status, code) => {
    makeService({ rpc: { data: { success: false, error: rpcError }, error: null } });
    const res = await POST(req({ name: 'Ana', phone: '3001234567' }), ctx());
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(code);
    expect(notifyHostOfGuest).not.toHaveBeenCalled();
  });

  it('answers 500 when the RPC itself errors', async () => {
    makeService({ rpc: { data: null, error: { message: 'boom' } } });
    const res = await POST(req({ name: 'Ana', phone: '3001234567' }), ctx());
    expect(res.status).toBe(500);
  });
});
