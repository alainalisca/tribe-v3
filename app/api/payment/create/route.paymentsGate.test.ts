/**
 * PAY-01: the instructor payments kill switch.
 *
 * Tribe cannot process payments or take a fee until its banking is resolved.
 * POST /api/payment/create is the only route that creates a Wompi transaction
 * or a Stripe Checkout Session for sessions, tips, boosts and Pro storefront,
 * so the gate lives on this ROUTE, not the UI: hiding a button leaves the
 * endpoint reachable by anyone who can POST.
 *
 * These tests assert that with INSTRUCTOR_PAYMENTS_ENABLED unset (or anything
 * other than the literal 'true') the handler returns 503 and NEVER reaches
 * auth, the rate limiter, Supabase, Wompi or Stripe, across every branch the
 * route dispatches to. With the flag exactly 'true' it proceeds past the gate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockCreateWompiTransaction = vi.fn();
const mockCreateStripeCheckoutSession = vi.fn();
const mockLog = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/logger', () => ({ log: mockLog, logError: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock('@/lib/validations/payment', () => ({
  createPaymentSchema: { safeParse: () => ({ success: true, data: {} }) },
}));
vi.mock('@/lib/payments/config', () => ({
  getPaymentGateway: (currency: string) => (currency === 'COP' ? 'wompi' : 'stripe'),
  isSupportedCurrency: () => true,
  calculateFees: () => ({ platformFeeCents: 0, instructorPayoutCents: 0 }),
  calculateFeesForUser: () => ({ platformFeeCents: 0, instructorPayoutCents: 0 }),
  PLATFORM_FEE_PERCENT: 15,
}));
vi.mock('@/lib/payments/wompi', () => ({ createWompiTransaction: mockCreateWompiTransaction }));
vi.mock('@/lib/payments/stripe', () => ({ createStripeCheckoutSession: mockCreateStripeCheckoutSession }));
vi.mock('@/lib/dal/tribeOSSubscription', () => ({ isCreatorPremium: vi.fn() }));
vi.mock('@/lib/dal/tips', () => ({ createTip: vi.fn() }));
vi.mock('@/lib/dal/promote', () => ({ validatePromoCode: vi.fn(), redeemPromoCode: vi.fn() }));

const ORIGINAL = process.env.INSTRUCTOR_PAYMENTS_ENABLED;

const BOOST_BODY = { payment_type: 'boost_campaign', currency: 'USD', reference_id: 'boost-1' };
const SESSION_USD_BODY = { payment_type: 'session_participation', session_id: 'sess-1' };
const SESSION_COP_BODY = { session_id: 'sess-cop-1', currency: 'COP' };
const TIP_COP_BODY = { payment_type: 'tip', instructor_id: 'inst-1', currency: 'COP', amount_cents: 1_000_000 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.com' } }, error: null });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;
  else process.env.INSTRUCTOR_PAYMENTS_ENABLED = ORIGINAL;
});

async function post(body: Record<string, unknown>) {
  const { POST } = await import('./route');
  return POST(
    new NextRequest('https://tribe-v3.vercel.app/api/payment/create', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: new Headers({ 'content-type': 'application/json' }),
    })
  );
}

function expectNothingRan() {
  expect(mockCreateStripeCheckoutSession).not.toHaveBeenCalled();
  expect(mockCreateWompiTransaction).not.toHaveBeenCalled();
  expect(mockGetUser).not.toHaveBeenCalled();
  expect(mockCheckRateLimit).not.toHaveBeenCalled();
}

describe('instructor payments gate: flag unset or not "true"', () => {
  it('boost branch: returns 503 payments_disabled and never reaches Stripe or Wompi', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    const res = await post(BOOST_BODY);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'payments_disabled' });
    expectNothingRan();
  });

  it('session branch (USD, Stripe-routed): returns 503 and never reaches Stripe or Wompi', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    const res = await post(SESSION_USD_BODY);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'payments_disabled' });
    expectNothingRan();
  });

  it('session branch (COP, Wompi-routed, legacy session_id body): returns 503 and never reaches Wompi', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    const res = await post(SESSION_COP_BODY);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'payments_disabled' });
    expectNothingRan();
  });

  it('tip branch (COP, Wompi-routed): returns 503 and never reaches Wompi', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    const res = await post(TIP_COP_BODY);

    expect(res.status).toBe(503);
    expectNothingRan();
  });

  it('logs a structured instructor_payments_blocked warning with the requested type', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    await post(BOOST_BODY);

    expect(mockLog).toHaveBeenCalledWith(
      'warn',
      'instructor_payments_blocked',
      expect.objectContaining({
        route: 'POST /api/payment/create',
        action: 'payments_disabled',
        payment_type: 'boost_campaign',
      })
    );
  });

  it('reports the implicit session_participation type for a legacy session_id body', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    await post(SESSION_COP_BODY);

    expect(mockLog).toHaveBeenCalledWith(
      'warn',
      'instructor_payments_blocked',
      expect.objectContaining({ payment_type: 'session_participation' })
    );
  });

  it('still returns 503 when the body is not JSON', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;
    const { POST } = await import('./route');

    const res = await POST(
      new NextRequest('https://tribe-v3.vercel.app/api/payment/create', { method: 'POST', body: 'not json' })
    );

    expect(res.status).toBe(503);
    expectNothingRan();
  });

  it('returns 503 for the literal string "false"', async () => {
    process.env.INSTRUCTOR_PAYMENTS_ENABLED = 'false';
    const res = await post(SESSION_USD_BODY);
    expect(res.status).toBe(503);
    expectNothingRan();
  });

  it('is strict: "1", "TRUE", "yes" and "True" do NOT enable payments', async () => {
    for (const value of ['1', 'TRUE', 'yes', 'True']) {
      process.env.INSTRUCTOR_PAYMENTS_ENABLED = value;
      vi.resetModules();
      const res = await post(BOOST_BODY);
      expect(res.status, `value ${value} must not enable payments`).toBe(503);
    }
    expectNothingRan();
  });
});

describe('instructor payments gate: flag exactly "true"', () => {
  it('boost branch: passes the gate and proceeds to the authenticated flow', async () => {
    process.env.INSTRUCTOR_PAYMENTS_ENABLED = 'true';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

    const res = await post(BOOST_BODY);

    // Past the gate: it now fails on auth instead, proving the gate is open.
    expect(res.status).toBe(401);
    expect(mockGetUser).toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalledWith('warn', 'instructor_payments_blocked', expect.anything());
  });

  it('session branch (COP, Wompi-routed): passes the gate and proceeds to the authenticated flow', async () => {
    process.env.INSTRUCTOR_PAYMENTS_ENABLED = 'true';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

    const res = await post(SESSION_COP_BODY);

    expect(res.status).toBe(401);
    expect(mockGetUser).toHaveBeenCalled();
  });

  it('reads the flag at call time, not at import time', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;
    const { POST } = await import('./route');
    const make = () =>
      new NextRequest('https://tribe-v3.vercel.app/api/payment/create', {
        method: 'POST',
        body: JSON.stringify(BOOST_BODY),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

    expect((await POST(make())).status).toBe(503);

    process.env.INSTRUCTOR_PAYMENTS_ENABLED = 'true';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

    // Same imported module, flag flipped afterwards: must now pass the gate.
    expect((await POST(make())).status).toBe(401);
  });
});
