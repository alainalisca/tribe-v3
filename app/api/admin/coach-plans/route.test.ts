import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/auth/adminApi', () => ({ requireApiAdmin: vi.fn() }));
vi.mock('@/lib/dal/coachPlans', () => ({ grantCoachPlanComp: vi.fn(), revokeCoachPlanComp: vi.fn() }));

import { POST } from './route';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { grantCoachPlanComp, revokeCoachPlanComp } from '@/lib/dal/coachPlans';

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const TARGET = '00000000-0000-4000-8000-0000000000b0';
const service = { tag: 'service' };

function call(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/admin/coach-plans', { method: 'POST', body: JSON.stringify(body) })
  );
}

const compRow = {
  id: TARGET,
  coach_plan: 'embajador',
  coach_plan_source: 'comp',
  coach_plan_granted_at: '2026-10-12T00:00:00Z',
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'true');
  vi.mocked(requireApiAdmin).mockResolvedValue({ ok: true, service, userId: ADMIN } as never);
  vi.mocked(grantCoachPlanComp).mockResolvedValue({ success: true, data: compRow });
  vi.mocked(revokeCoachPlanComp).mockResolvedValue({
    success: true,
    data: { ...(compRow as object), coach_plan: 'basico' } as never,
  });
});

describe('POST /api/admin/coach-plans', () => {
  it('404 while the flag is off, before the admin gate', async () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'false');
    expect((await call({ userId: TARGET, action: 'grant', plan: 'embajador' })).status).toBe(404);
    expect(requireApiAdmin).not.toHaveBeenCalled();
  });

  it('a non-admin gets the gate refusal and nothing is written', async () => {
    vi.mocked(requireApiAdmin).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await call({ userId: TARGET, action: 'grant', plan: 'embajador' })).status).toBe(403);
    expect(grantCoachPlanComp).not.toHaveBeenCalled();
  });

  it('400 on a bad body', async () => {
    expect((await call({ userId: 'nope', action: 'grant', plan: 'embajador' })).status).toBe(400);
    expect((await call({ userId: TARGET, action: 'grant', plan: 'basico' })).status).toBe(400);
    expect((await call({ userId: TARGET, action: 'delete' })).status).toBe(400);
  });

  it('grants a comp with the calling admin as granted_by', async () => {
    const res = await call({ userId: TARGET, action: 'grant', plan: 'embajador' });
    expect(res.status).toBe(200);
    expect(grantCoachPlanComp).toHaveBeenCalledWith(service, TARGET, 'embajador', ADMIN);
    expect((await res.json()).user.coach_plan).toBe('embajador');
  });

  it('409 when the user pays through Stripe', async () => {
    vi.mocked(grantCoachPlanComp).mockResolvedValue({ success: false, error: 'has_stripe_subscription' });
    expect((await call({ userId: TARGET, action: 'grant', plan: 'pro' })).status).toBe(409);
  });

  it('revokes a comp, and 404s on something that is not a comp', async () => {
    expect((await call({ userId: TARGET, action: 'revoke' })).status).toBe(200);
    expect(revokeCoachPlanComp).toHaveBeenCalledWith(service, TARGET);
    vi.mocked(revokeCoachPlanComp).mockResolvedValue({ success: false, error: 'not_a_comp' });
    expect((await call({ userId: TARGET, action: 'revoke' })).status).toBe(404);
  });
});
