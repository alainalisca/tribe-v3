/**
 * PAY-01: Stripe Connect onboarding is behind the instructor payments kill
 * switch. This route creates a Connect account and an onboarding link, which
 * is the front door to Tribe processing payments for instructors, so it must
 * refuse while INSTRUCTOR_PAYMENTS_ENABLED is not exactly 'true'.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn();
const mockCreateAccount = vi.fn();
const mockCreateOnboardingLink = vi.fn();
const mockLog = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/logger', () => ({ log: mockLog, logError: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => ({
  createStripeConnectAccount: mockCreateAccount,
  createStripeConnectOnboardingLink: mockCreateOnboardingLink,
}));

const ORIGINAL = process.env.INSTRUCTOR_PAYMENTS_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.com' } }, error: null });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;
  else process.env.INSTRUCTOR_PAYMENTS_ENABLED = ORIGINAL;
});

async function post() {
  const { POST } = await import('./route');
  return POST(new NextRequest('https://tribe-v3.vercel.app/api/stripe/connect/onboard', { method: 'POST' }));
}

describe('connect onboard gate: flag unset or not "true"', () => {
  it('returns 503 payments_disabled and never reaches Stripe or auth', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    const res = await post();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'payments_disabled' });
    expect(mockCreateAccount).not.toHaveBeenCalled();
    expect(mockCreateOnboardingLink).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('logs a structured instructor_payments_blocked warning naming the route', async () => {
    delete process.env.INSTRUCTOR_PAYMENTS_ENABLED;

    await post();

    expect(mockLog).toHaveBeenCalledWith('warn', 'instructor_payments_blocked', {
      route: 'POST /api/stripe/connect/onboard',
      action: 'payments_disabled',
    });
  });

  it('is strict: "false", "1", "TRUE", "yes" and "True" do NOT open the route', async () => {
    for (const value of ['false', '1', 'TRUE', 'yes', 'True']) {
      process.env.INSTRUCTOR_PAYMENTS_ENABLED = value;
      vi.resetModules();
      const res = await post();
      expect(res.status, `value ${value} must not enable payments`).toBe(503);
    }
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

describe('connect onboard gate: flag exactly "true"', () => {
  it('passes the gate and proceeds to the authenticated flow', async () => {
    process.env.INSTRUCTOR_PAYMENTS_ENABLED = 'true';
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Unauthorized' } });

    const res = await post();

    // Past the gate: it now fails on auth instead, proving the gate is open.
    expect(res.status).toBe(401);
    expect(mockGetUser).toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalledWith('warn', 'instructor_payments_blocked', expect.anything());
  });
});
