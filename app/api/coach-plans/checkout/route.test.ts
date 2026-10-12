import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn(() => ({})) }));
vi.mock('@/lib/dal/coachPlans', () => ({ fetchCoachPlanRow: vi.fn(), setCoachPlanCustomerId: vi.fn() }));
vi.mock('@/lib/payments/coachPlanStripe', () => ({
  createCoachPlanCustomer: vi.fn(),
  createCoachPlanCheckoutSession: vi.fn(),
}));

import { POST } from './route';
import { createClient } from '@/lib/supabase/server';
import { fetchCoachPlanRow, setCoachPlanCustomerId } from '@/lib/dal/coachPlans';
import { createCoachPlanCheckoutSession, createCoachPlanCustomer } from '@/lib/payments/coachPlanStripe';

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'coach@example.com' };

function row(over: Record<string, unknown> = {}) {
  return {
    success: true as const,
    data: {
      id: USER.id,
      name: 'Coach',
      is_instructor: true,
      coach_plan: 'basico',
      coach_plan_status: null,
      coach_plan_source: null,
      coach_plan_stripe_customer_id: null,
      coach_plan_stripe_subscription_id: null,
      coach_plan_current_period_end: null,
      coach_plan_granted_by: null,
      coach_plan_granted_at: null,
      ...over,
    } as never,
  };
}

function call(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/coach-plans/checkout', { method: 'POST', body: JSON.stringify(body) })
  );
}

function signedIn(user: typeof USER | null) {
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'true');
  vi.stubEnv('STRIPE_COACH_PRO_PRICE_ID', 'price_pro');
  vi.stubEnv('STRIPE_CRECIMIENTO_PRICE_ID', 'price_crec');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://tribe.test');
  signedIn(USER);
  vi.mocked(fetchCoachPlanRow).mockResolvedValue(row());
  vi.mocked(createCoachPlanCustomer).mockResolvedValue({ success: true, customerId: 'cus_new' });
  vi.mocked(setCoachPlanCustomerId).mockResolvedValue({ success: true, data: null });
  vi.mocked(createCoachPlanCheckoutSession).mockResolvedValue({ success: true, url: 'https://checkout.stripe.test/s' });
});

describe('POST /api/coach-plans/checkout', () => {
  it('is a 404 while COACH_PLANS_ENABLED is off, before touching auth or Stripe', async () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'false');
    const res = await call({ plan: 'pro' });
    expect(res.status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
    expect(createCoachPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it('401 when signed out', async () => {
    signedIn(null);
    expect((await call({ plan: 'pro' })).status).toBe(401);
  });

  it('400 for a plan that is not sold (embajador is comp only)', async () => {
    expect((await call({ plan: 'embajador' })).status).toBe(400);
    expect((await call({})).status).toBe(400);
  });

  it('503 when the price id is not configured', async () => {
    vi.stubEnv('STRIPE_CRECIMIENTO_PRICE_ID', '');
    expect((await call({ plan: 'crecimiento' })).status).toBe(503);
  });

  it('403 for an athlete account', async () => {
    vi.mocked(fetchCoachPlanRow).mockResolvedValue(row({ is_instructor: false }));
    expect((await call({ plan: 'pro' })).status).toBe(403);
  });

  it('409 for a comp and for an active subscriber', async () => {
    vi.mocked(fetchCoachPlanRow).mockResolvedValue(
      row({ coach_plan: 'embajador', coach_plan_source: 'comp', coach_plan_status: 'active' })
    );
    expect((await call({ plan: 'pro' })).status).toBe(409);
    vi.mocked(fetchCoachPlanRow).mockResolvedValue(
      row({ coach_plan: 'pro', coach_plan_source: 'stripe', coach_plan_status: 'active' })
    );
    expect((await call({ plan: 'pro' })).status).toBe(409);
    expect(createCoachPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates and saves a coach-plan customer, then a subscription checkout back to /planes', async () => {
    const res = await call({ plan: 'pro' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/s' });
    expect(setCoachPlanCustomerId).toHaveBeenCalledWith(expect.anything(), USER.id, 'cus_new');
    expect(createCoachPlanCheckoutSession).toHaveBeenCalledWith({
      customerId: 'cus_new',
      priceId: 'price_pro',
      plan: 'pro',
      userId: USER.id,
      successUrl: 'https://tribe.test/planes/?checkout=success',
      cancelUrl: 'https://tribe.test/planes/?checkout=canceled',
    });
  });

  it('reuses the coach-plan customer a returning coach already has', async () => {
    vi.mocked(fetchCoachPlanRow).mockResolvedValue(
      row({ coach_plan_stripe_customer_id: 'cus_old', coach_plan_source: 'stripe', coach_plan_status: 'canceled' })
    );
    await call({ plan: 'crecimiento' });
    expect(createCoachPlanCustomer).not.toHaveBeenCalled();
    expect(vi.mocked(createCoachPlanCheckoutSession).mock.calls[0][0]).toMatchObject({
      customerId: 'cus_old',
      priceId: 'price_crec',
    });
  });
});
