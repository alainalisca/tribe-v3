import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const h = vi.hoisted(() => ({
  off: vi.fn(),
  getUser: vi.fn(),
  claim: vi.fn(),
  deliver: vi.fn(),
  client: {} as Record<string, unknown>,
}));
vi.mock('@/lib/features/athleteValueServer', () => ({ athleteValueOr404: h.off }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ ...h.client, auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/dal/coachWelcome', () => ({ claimWelcomeForJoin: h.claim }));
vi.mock('@/lib/coachContact/welcomeDelivery', () => ({ deliverWelcome: h.deliver, WELCOME_FEATURE: 'welcome' }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { POST } from './route';

const SID = '11111111-1111-1111-1111-111111111111';
const req = (body: unknown) =>
  new Request('http://localhost:3001/api/coach-welcome/', { method: 'POST', body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.off.mockResolvedValue(null);
  h.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  h.claim.mockResolvedValue({ success: true, data: [{ recipientId: 'u1' }] });
  h.deliver.mockResolvedValue(1);
});

describe('POST /api/coach-welcome', () => {
  it('flag off: the program 404, before anything else', async () => {
    h.off.mockResolvedValue(NextResponse.json({}, { status: 404 }));
    const res = await POST(req({ sessionId: SID }));
    expect(res.status).toBe(404);
    expect(h.off).toHaveBeenCalledWith('welcome');
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('signed out: 401, nothing claimed', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await POST(req({ sessionId: SID }))).status).toBe(401);
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('a session id that is not a uuid: 400', async () => {
    expect((await POST(req({ sessionId: 'nope' }))).status).toBe(400);
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('claims with the caller session and delivers what was decided, with this request origin', async () => {
    const res = await POST(req({ sessionId: SID }));
    expect(await res.json()).toEqual({ ok: true });
    expect(h.claim).toHaveBeenCalledWith(expect.objectContaining({ auth: expect.anything() }), SID);
    expect(h.deliver).toHaveBeenCalledWith([{ recipientId: 'u1' }], 'http://localhost:3001');
  });

  it('a refusal delivers nothing and still answers ok (never says who was welcomed)', async () => {
    h.claim.mockResolvedValue({ success: false, error: 'not_joined' });
    expect(await (await POST(req({ sessionId: SID }))).json()).toEqual({ ok: true });
    expect(h.deliver).not.toHaveBeenCalled();
  });
});
