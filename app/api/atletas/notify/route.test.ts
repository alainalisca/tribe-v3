/**
 * T-AV27b: POST /api/atletas/notify. The route chooses nothing but the pass and
 * the event; who is told is 8209's decision (proof: t-av27b-proof.LOCAL.sh).
 *
 * Mutation proofs (run by the T-AV27b unit arms):
 *   - claim with a service-role client instead of the caller's -> "claims with the caller's own session"
 *   - deliver even when the claim refused -> "a refused claim delivers nothing"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const h = vi.hoisted(() => ({ off: vi.fn(), getUser: vi.fn(), claim: vi.fn(), deliver: vi.fn(), client: {} }));
vi.mock('@/lib/features/athleteValueServer', () => ({ athleteValueOr404: h.off }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => Object.assign(h.client, { auth: { getUser: h.getUser } }),
}));
vi.mock('@/lib/dal/athleteNotify', () => ({ claimDoorNotifications: h.claim }));
vi.mock('@/lib/atletas/athleteNotifications', () => ({ deliverNotifications: h.deliver }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { POST } from './route';

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost:3101/api/atletas/notify/', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.off.mockResolvedValue(null);
  h.getUser.mockResolvedValue({ data: { user: { id: 'elena' } }, error: null });
  h.claim.mockResolvedValue({ success: true, data: [{ event: 'arrived' }] });
  h.deliver.mockResolvedValue(1);
});

describe('POST /api/atletas/notify', () => {
  it('flag off: 404 before the session is read', async () => {
    h.off.mockResolvedValue(NextResponse.json({ error: 'not_found' }, { status: 404 }));
    expect((await post({ passCode: 'AV-CARB', event: 'arrived' })).status).toBe(404);
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('signed out: 401 and nothing claimed', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await post({ passCode: 'AV-CARB', event: 'arrived' })).status).toBe(401);
    expect(h.claim).not.toHaveBeenCalled();
  });

  it('only a pass-shaped code and arrived or joined are accepted', async () => {
    for (const body of [{ passCode: 'nope', event: 'arrived' }, { passCode: 'AV-CARB', event: 'ready' }, '{x']) {
      expect((await post(body)).status).toBe(400);
    }
    expect(h.claim).not.toHaveBeenCalled();
  });

  it("claims with the caller's own session and delivers to the request's origin", async () => {
    const res = await post({ passCode: ' av-carb ', event: 'arrived' });
    expect(await res.json()).toStrictEqual({ ok: true });
    expect(h.claim).toHaveBeenCalledWith(h.client, 'AV-CARB', 'arrived');
    expect(h.deliver).toHaveBeenCalledWith(h.client, [{ event: 'arrived' }], {
      actorId: 'elena',
      origin: 'http://localhost:3101',
    });
  });

  it('a refused claim (not yours, not happened) delivers nothing, with the same quiet answer', async () => {
    h.claim.mockResolvedValue({ success: false, error: 'not_found' });
    const res = await post({ passCode: 'AV-CARB', event: 'joined' });
    expect(res.status).toBe(200);
    expect(await res.json()).toStrictEqual({ ok: true });
    expect(h.deliver).not.toHaveBeenCalled();
  });
});
