import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the route module
// ---------------------------------------------------------------------------

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(),
}));

vi.mock('@/lib/validations/payment', () => ({
  createPaymentSchema: {
    safeParse: vi.fn(),
  },
}));

vi.mock('@/lib/payments/config', () => ({
  getPaymentGateway: vi.fn(),
  isSupportedCurrency: vi.fn(),
  calculateFees: vi.fn(),
  PLATFORM_FEE_PERCENT: 15,
}));

vi.mock('@/lib/payments/wompi', () => ({
  createWompiTransaction: vi.fn(),
}));

vi.mock('@/lib/payments/stripe', () => ({
  createStripeCheckoutSession: vi.fn(),
}));

import { POST } from './route';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClientImport } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rate-limit';
import { createPaymentSchema } from '@/lib/validations/payment';
import { getPaymentGateway, isSupportedCurrency, calculateFees } from '@/lib/payments/config';
import { createWompiTransaction } from '@/lib/payments/wompi';
import { createStripeCheckoutSession } from '@/lib/payments/stripe';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(body: object): NextRequest {
  return new NextRequest('http://localhost/api/payment/create', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
  });
}

const TEST_USER_ID = 'user-aaa-111';
const TEST_SESSION_ID = 'sess-bbb-222';
const TEST_PAYMENT_ID = 'pay-ccc-333';

/**
 * Creates a chainable Supabase mock that resolves queries via configurable
 * overrides keyed by table name.
 */
function createSupabaseMock(overrides: Record<string, Record<string, unknown>> = {}) {
  const chain: Record<string, any> = {};
  let currentTable = '';

  chain.from = (table: string) => {
    currentTable = table;
    return chain;
  };
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.insert = () => chain;
  chain.update = () => chain;
  chain.single = () => {
    const tableOverride = overrides[currentTable];
    if (tableOverride) {
      return Promise.resolve({ data: tableOverride, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };
  chain.maybeSingle = () => {
    const tableOverride = overrides[currentTable];
    if (tableOverride) {
      return Promise.resolve({ data: tableOverride, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };

  // Allow auth mock to be attached
  chain.auth = {
    getUser: vi.fn(),
  };

  return chain;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('POST /api/payment/create', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';

    // Default: rate-limiting allows the request
    vi.mocked(rateLimit).mockReturnValue({ allowed: true } as never);
  });

  // -------------------------------------------------------------------------
  // 1. Missing auth -> 401
  // -------------------------------------------------------------------------
  it('returns 401 when the user is not authenticated', async () => {
    const supabaseMock = createSupabaseMock();
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'not authenticated' },
    });
    vi.mocked(createServerClient).mockResolvedValue(supabaseMock as never);

    // Zod parse won't even be reached, but set it up to avoid surprises
    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'session', session_id: TEST_SESSION_ID },
    } as never);

    const req = createMockRequest({ type: 'session', session_id: TEST_SESSION_ID });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  // -------------------------------------------------------------------------
  // 2. Invalid Zod input (bad type field) -> 400
  // -------------------------------------------------------------------------
  it('returns 400 when Zod validation fails (invalid type)', async () => {
    const supabaseMock = createSupabaseMock();
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID, email: 'test@tribe.com' } },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue(supabaseMock as never);

    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: false,
      error: {
        issues: [{ message: "Invalid enum value. Expected 'session' | 'boost_campaign' | 'pro_storefront'" }],
      },
    } as never);

    const req = createMockRequest({ type: 'invalid_type' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid enum value');
  });

  // -------------------------------------------------------------------------
  // 3. Missing session_id for session participation -> 400
  // -------------------------------------------------------------------------
  it('returns 400 when session_id is missing for session participation', async () => {
    const supabaseMock = createSupabaseMock();
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID, email: 'test@tribe.com' } },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue(supabaseMock as never);

    // Zod passes (session_id is optional in the schema)
    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'session' },
    } as never);

    // Body has no session_id and no payment_type override
    const req = createMockRequest({ type: 'session' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Missing session_id');
  });

  // -------------------------------------------------------------------------
  // 4. Non-existent session -> 404
  // -------------------------------------------------------------------------
  it('returns 404 when the session does not exist', async () => {
    // Auth supabase mock: session query returns null
    const supabaseMock = createSupabaseMock();
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID, email: 'test@tribe.com' } },
      error: null,
    });
    // Override single() to return null for the sessions table
    supabaseMock.single = () => Promise.resolve({ data: null, error: { message: 'not found' } });
    vi.mocked(createServerClient).mockResolvedValue(supabaseMock as never);

    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'session', session_id: TEST_SESSION_ID },
    } as never);

    const req = createMockRequest({ type: 'session', session_id: TEST_SESSION_ID });
    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Session not found');
  });

  // -------------------------------------------------------------------------
  // 5. Free session (is_paid=false) -> 400
  // -------------------------------------------------------------------------
  it('returns 400 when the session is not a paid session', async () => {
    const supabaseMock = createSupabaseMock({
      sessions: {
        id: TEST_SESSION_ID,
        is_paid: false,
        price_cents: 0,
        currency: 'COP',
        creator_id: 'other-user',
      },
    });
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID, email: 'test@tribe.com' } },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue(supabaseMock as never);

    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'session', session_id: TEST_SESSION_ID },
    } as never);

    const req = createMockRequest({ type: 'session', session_id: TEST_SESSION_ID });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('This is not a paid session');
  });

  // -------------------------------------------------------------------------
  // 6. Valid Stripe/USD session payment — verifies 15% fee, returns checkout URL
  // -------------------------------------------------------------------------
  it('creates a Stripe/USD session payment with correct fee calculation', async () => {
    const SESSION_PRICE_CENTS = 2000; // $20.00

    // Auth client: session query returns a paid USD session
    const authSupabaseMock = createSupabaseMock({
      sessions: {
        id: TEST_SESSION_ID,
        is_paid: true,
        price_cents: SESSION_PRICE_CENTS,
        currency: 'USD',
        sport: 'running',
        location: 'Medellín',
        creator_id: 'creator-xyz',
        platform_fee_percent: null,
      },
    });
    authSupabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID, email: 'athlete@tribe.com' } },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue(authSupabaseMock as never);

    // Service role client: existing payment check returns null, insert returns payment id
    const serviceSupabaseMock = createSupabaseMock({
      payments: { id: TEST_PAYMENT_ID },
    });
    vi.mocked(createServiceClientImport).mockReturnValue(serviceSupabaseMock as never);

    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'session', session_id: TEST_SESSION_ID },
    } as never);

    vi.mocked(isSupportedCurrency).mockReturnValue(true as never);
    vi.mocked(getPaymentGateway).mockReturnValue('stripe' as never);
    vi.mocked(calculateFees).mockReturnValue({
      platformFeeCents: 300, // 15% of 2000
      instructorPayoutCents: 1700,
    } as never);

    vi.mocked(createStripeCheckoutSession).mockResolvedValue({
      url: 'https://checkout.stripe.com/pay/cs_test_abc123',
      sessionId: 'cs_test_abc123',
    } as never);

    const req = createMockRequest({ type: 'session', session_id: TEST_SESSION_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.gateway).toBe('stripe');
    expect(body.data.payment_id).toBe(TEST_PAYMENT_ID);
    expect(body.data.redirect_url).toBe('https://checkout.stripe.com/pay/cs_test_abc123');

    // Verify fee calculation was called with correct args
    expect(calculateFees).toHaveBeenCalledWith(SESSION_PRICE_CENTS, 15);

    // Verify Stripe was called (not Wompi)
    expect(createStripeCheckoutSession).toHaveBeenCalledOnce();
    expect(createWompiTransaction).not.toHaveBeenCalled();

    // Verify Stripe received the correct amount and currency
    const stripeCall = vi.mocked(createStripeCheckoutSession).mock.calls[0][0];
    expect(stripeCall.amountCents).toBe(SESSION_PRICE_CENTS);
    expect(stripeCall.currency).toBe('USD');
    expect(stripeCall.customerEmail).toBe('athlete@tribe.com');
    expect(stripeCall.sessionId).toBe(TEST_SESSION_ID);
    expect(stripeCall.participantUserId).toBe(TEST_USER_ID);
  });

  // -------------------------------------------------------------------------
  // 7. Valid Wompi/COP session payment — verifies COP gateway, returns checkout URL
  // -------------------------------------------------------------------------
  it('creates a Wompi/COP session payment and returns a redirect URL', async () => {
    const SESSION_PRICE_CENTS = 5000000; // 50,000 COP

    // Auth client: session query returns a paid COP session
    const authSupabaseMock = createSupabaseMock({
      sessions: {
        id: TEST_SESSION_ID,
        is_paid: true,
        price_cents: SESSION_PRICE_CENTS,
        currency: 'COP',
        sport: 'crossfit',
        location: 'El Poblado',
        creator_id: 'creator-abc',
        platform_fee_percent: null,
      },
    });
    authSupabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: TEST_USER_ID, email: 'deportista@tribe.com' } },
      error: null,
    });
    vi.mocked(createServerClient).mockResolvedValue(authSupabaseMock as never);

    // Service role client: existing payment check returns null, insert returns payment id
    const serviceSupabaseMock = createSupabaseMock({
      payments: { id: TEST_PAYMENT_ID },
    });
    vi.mocked(createServiceClientImport).mockReturnValue(serviceSupabaseMock as never);

    vi.mocked(createPaymentSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'session', session_id: TEST_SESSION_ID },
    } as never);

    vi.mocked(isSupportedCurrency).mockReturnValue(true as never);
    vi.mocked(getPaymentGateway).mockReturnValue('wompi' as never);
    vi.mocked(calculateFees).mockReturnValue({
      platformFeeCents: 750000, // 15% of 5,000,000
      instructorPayoutCents: 4250000,
    } as never);

    vi.mocked(createWompiTransaction).mockResolvedValue({
      transaction_id: 'wompi-txn-456',
      redirect_url: 'https://checkout.wompi.co/l/test_abc789',
    } as never);

    const req = createMockRequest({ type: 'session', session_id: TEST_SESSION_ID });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.gateway).toBe('wompi');
    expect(body.data.payment_id).toBe(TEST_PAYMENT_ID);
    expect(body.data.redirect_url).toBe('https://checkout.wompi.co/l/test_abc789');

    // Verify fee calculation was called with correct args
    expect(calculateFees).toHaveBeenCalledWith(SESSION_PRICE_CENTS, 15);

    // Verify Wompi was called (not Stripe)
    expect(createWompiTransaction).toHaveBeenCalledOnce();
    expect(createStripeCheckoutSession).not.toHaveBeenCalled();

    // Verify Wompi received the correct amount and currency
    const wompiCall = vi.mocked(createWompiTransaction).mock.calls[0][0];
    expect(wompiCall.amountCents).toBe(SESSION_PRICE_CENTS);
    expect(wompiCall.currency).toBe('COP');
    expect(wompiCall.customerEmail).toBe('deportista@tribe.com');
    expect(wompiCall.reference).toBe(TEST_PAYMENT_ID);
  });
});
