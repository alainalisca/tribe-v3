import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests for POST /api/payment/create.
 *
 * Rewritten 2026-04-21. The route is ~400 lines with three distinct payment
 * flows (session_participation, boost_campaign, pro_storefront) and two
 * gateways (stripe/USD, wompi/COP). Full-coverage testing would be a
 * separate project.
 *
 * This file exercises the authentication gate + the session_participation
 * happy path through both gateways — the only code paths that actually
 * execute on the critical user journey. The remaining flows share
 * infrastructure (gateway selection, payment record insert, service
 * client construction) and are exercised indirectly by these tests.
 *
 * Coverage:
 *   1. Unauthenticated request → 401
 *   2. Rate-limited request → 429
 *   3. Zod validation failure → 400
 *   4. Session not found → 404
 *   5. Self-payment (creator_id === user.id) → 400
 *   6. Already-approved payment → 400
 *   7. Happy path (USD → Stripe) → 200 with redirect URL
 *   8. Happy path (COP → Wompi) → 200 with redirect URL
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock('@/lib/validations/payment', () => ({
  createPaymentSchema: {
    safeParse: vi.fn(),
  },
}));

vi.mock('@/lib/payments/config', () => ({
  getPaymentGateway: vi.fn(),
  isSupportedCurrency: vi.fn().mockReturnValue(true),
  calculateFees: vi.fn().mockReturnValue({ platformFeeCents: 0, instructorPayoutCents: 0 }),
  calculateFeesForUser: vi.fn().mockReturnValue({ platformFeeCents: 100, instructorPayoutCents: 900 }),
  PLATFORM_FEE_PERCENT: 10,
}));

vi.mock('@/lib/payments/wompi', () => ({
  createWompiTransaction: vi.fn(),
}));

vi.mock('@/lib/payments/stripe', () => ({
  createStripeCheckoutSession: vi.fn(),
}));

// Promo code module is a dynamic import inside the route; guarded here.
vi.mock('@/lib/dal/promote', () => ({
  validatePromoCode: vi.fn().mockResolvedValue({ success: false }),
  redeemPromoCode: vi.fn(),
}));

import { POST } from './route';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { createPaymentSchema } from '@/lib/validations/payment';
import { getPaymentGateway } from '@/lib/payments/config';
import { createWompiTransaction } from '@/lib/payments/wompi';
import { createStripeCheckoutSession } from '@/lib/payments/stripe';

// ── Mock helpers ───────────────────────────────────────────────────

const AUTH_USER = { id: 'user-1', email: 'buyer@test.com' };
const CREATOR_ID = 'creator-1';

function makeAuthClient(
  authenticated: boolean,
  session?: Record<string, unknown> | null,
  creatorProfile?: { stripe_account_id: string | null; stripe_onboarding_complete: boolean } | null
) {
  const sessionSingle = vi.fn().mockResolvedValue({
    data: session ?? null,
    error: session ? null : { message: 'not found' },
  });
  // Default: creator has completed Connect onboarding (happy path for USD
  // tests). Individual tests can pass `creatorProfile: null` to simulate a
  // not-yet-onboarded instructor.
  const defaultCreator = { stripe_account_id: 'acct_test_creator', stripe_onboarding_complete: true };
  const creatorProfileMaybeSingle = vi.fn().mockResolvedValue({
    data: creatorProfile === undefined ? defaultCreator : creatorProfile,
    error: null,
  });
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue(
          authenticated
            ? { data: { user: AUTH_USER }, error: null }
            : { data: { user: null }, error: { message: 'Unauthorized' } }
        ),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: creatorProfileMaybeSingle }),
          }),
        };
      }
      // Default shape: sessions lookup.
      return {
        select: () => ({
          eq: () => ({ single: sessionSingle }),
        }),
      };
    }),
  };
}

function makeServiceClient(existingPayment: { status: string } | null = null) {
  // Approved-payment lookup is now .select().eq().eq().eq().maybeSingle()
  // (three eqs: session_id, participant_user_id, status='approved').
  const approvedPaymentMaybeSingle = vi.fn().mockResolvedValue({
    data: existingPayment && existingPayment.status === 'approved' ? existingPayment : null,
    error: null,
  });
  const buyerProfileMaybeSingle = vi.fn().mockResolvedValue({
    data: { subscription_tier: null, subscription_expires_at: null },
    error: null,
  });
  const paymentInsertSingle = vi.fn().mockResolvedValue({
    data: { id: 'pay-new-1' },
    error: null,
  });
  const paymentUpdateEq = vi.fn().mockResolvedValue({ error: null });
  // Stale-row cleanup: .delete().eq().eq().in(...).
  const paymentsDeleteIn = vi.fn().mockResolvedValue({ error: null });

  return {
    from: vi.fn((table: string) => {
      if (table === 'payments') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: approvedPaymentMaybeSingle }),
              }),
            }),
          }),
          insert: () => ({ select: () => ({ single: paymentInsertSingle }) }),
          update: () => ({ eq: paymentUpdateEq }),
          delete: () => ({
            eq: () => ({
              eq: () => ({ in: paymentsDeleteIn }),
            }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: buyerProfileMaybeSingle }),
          }),
        };
      }
      return {};
    }),
  };
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/payment/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POST /api/payment/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

    // Sensible defaults.
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true } as never);
    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: true,
      data: {},
    } as never);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createServerClient).mockResolvedValue(makeAuthClient(false) as never);
    const res = await POST(request({ session_id: 'sess-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 429 when rate-limited', async () => {
    vi.mocked(createServerClient).mockResolvedValue(makeAuthClient(true) as never);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false } as never);
    const res = await POST(request({ session_id: 'sess-1' }));
    expect(res.status).toBe(429);
  });

  it('returns 400 when Zod validation fails', async () => {
    vi.mocked(createServerClient).mockResolvedValue(makeAuthClient(true) as never);
    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'bad input' }] },
    } as never);

    const res = await POST(request({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('bad input');
  });

  it('returns 404 when the session is not found', async () => {
    vi.mocked(createServerClient).mockResolvedValue(makeAuthClient(true, null) as never);
    const res = await POST(request({ session_id: 'sess-missing' }));
    expect(res.status).toBe(404);
  });

  it('rejects self-payment (creator_id === user.id)', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      makeAuthClient(true, {
        id: 'sess-1',
        is_paid: true,
        price_cents: 1000,
        currency: 'USD',
        creator_id: AUTH_USER.id, // caller IS the creator
      }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as never);

    const res = await POST(request({ session_id: 'sess-1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Cannot pay for your own session');
  });

  it('rejects when an approved payment already exists', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      makeAuthClient(true, {
        id: 'sess-1',
        is_paid: true,
        price_cents: 1000,
        currency: 'USD',
        creator_id: CREATOR_ID,
      }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient({ status: 'approved' }) as never);

    const res = await POST(request({ session_id: 'sess-1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Payment already completed');
  });

  it('happy path (USD → Stripe) returns checkout URL', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      makeAuthClient(true, {
        id: 'sess-1',
        is_paid: true,
        price_cents: 2500,
        currency: 'USD',
        creator_id: CREATOR_ID,
        platform_fee_percent: 10,
      }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as never);
    vi.mocked(getPaymentGateway).mockReturnValue('stripe' as never);
    vi.mocked(createStripeCheckoutSession).mockResolvedValue({
      url: 'https://checkout.stripe.com/pay/cs_test',
      sessionId: 'cs_test_123',
    } as never);

    const res = await POST(request({ session_id: 'sess-1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.gateway).toBe('stripe');
    expect(createStripeCheckoutSession).toHaveBeenCalled();
  });

  it('happy path (COP → Wompi) returns redirect URL', async () => {
    vi.mocked(createServerClient).mockResolvedValue(
      makeAuthClient(true, {
        id: 'sess-2',
        is_paid: true,
        // Must be ≥ COP 20,000 (2,000,000 "cents") to clear the server-side
        // minimum-price gate in the route.
        price_cents: 4500000,
        currency: 'COP',
        creator_id: CREATOR_ID,
        platform_fee_percent: 10,
      }) as never
    );
    vi.mocked(createServiceClient).mockReturnValue(makeServiceClient() as never);
    vi.mocked(getPaymentGateway).mockReturnValue('wompi' as never);
    vi.mocked(createWompiTransaction).mockResolvedValue({
      redirect_url: 'https://checkout.wompi.co/p/abc',
      transaction_id: 'txn_1',
    } as never);

    const res = await POST(request({ session_id: 'sess-2' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.gateway).toBe('wompi');
    expect(createWompiTransaction).toHaveBeenCalled();
  });
});
