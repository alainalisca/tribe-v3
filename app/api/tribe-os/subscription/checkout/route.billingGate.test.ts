/**
 * The Tribe.OS checkout route must not be able to charge anyone while the
 * product is unreleased.
 *
 * The gate is on the ROUTE, not the UI, because the route is the part that
 * takes money: hiding the Subscribe button leaves this endpoint reachable by
 * anyone who can POST. These tests assert that with the flag off, the handler
 * returns 503 and NEVER reaches Stripe or Supabase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetUser = vi.fn();
const mockCreateCheckoutSession = vi.fn();
const mockCreateCustomer = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => ({
  createTribeOSStripeCustomer: mockCreateCustomer,
  createTribeOSCheckoutSession: mockCreateCheckoutSession,
}));
vi.mock('@/lib/dal/tribeOSSubscription', () => ({ setTribeOSStripeCustomerId: vi.fn() }));
vi.mock('@/lib/dal/tribeOSPremium', () => ({ isTribeOSPremiumActive: () => false }));
vi.mock('@/lib/dal/gyms', () => ({ createGym: vi.fn(), getGymForUser: vi.fn(), updateGym: vi.fn() }));
vi.mock('@/lib/dal/gymCoaches', () => ({ addCoachToGym: vi.fn() }));

const ORIGINAL = process.env.TRIBE_OS_BILLING_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.com' } } });
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TRIBE_OS_BILLING_ENABLED;
  else process.env.TRIBE_OS_BILLING_ENABLED = ORIGINAL;
});

async function post() {
  const { POST } = await import('./route');
  return POST(
    new Request('https://tribe-v3.vercel.app/api/tribe-os/subscription/checkout/', { method: 'POST' }) as never
  );
}

describe('billing gate — flag unset or false', () => {
  it('returns 503 when TRIBE_OS_BILLING_ENABLED is unset', async () => {
    delete process.env.TRIBE_OS_BILLING_ENABLED;

    const res = await post();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ success: false, error: 'billing_disabled' });
  });

  it('NEVER reaches Stripe or the auth check when disabled', async () => {
    delete process.env.TRIBE_OS_BILLING_ENABLED;

    await post();

    // The money calls must not happen.
    expect(mockCreateCheckoutSession).not.toHaveBeenCalled();
    expect(mockCreateCustomer).not.toHaveBeenCalled();
    // It short-circuits before even authenticating, so no session work either.
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns 503 for the literal string "false"', async () => {
    process.env.TRIBE_OS_BILLING_ENABLED = 'false';
    const res = await post();
    expect(res.status).toBe(503);
  });

  it('is strict: "1", "TRUE" and "yes" do NOT enable billing', async () => {
    for (const value of ['1', 'TRUE', 'yes', 'True']) {
      process.env.TRIBE_OS_BILLING_ENABLED = value;
      vi.resetModules();
      const res = await post();
      expect(res.status, `value ${value} must not enable billing`).toBe(503);
    }
  });
});

describe('billing gate — flag exactly "true"', () => {
  it('passes the gate and proceeds to the authenticated flow', async () => {
    process.env.TRIBE_OS_BILLING_ENABLED = 'true';
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await post();

    // Past the gate: it now fails on auth instead, proving the gate is open.
    expect(res.status).toBe(401);
    expect(mockGetUser).toHaveBeenCalled();
  });
});
