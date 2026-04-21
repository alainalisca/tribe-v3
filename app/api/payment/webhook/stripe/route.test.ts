import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Rewritten fixtures for the post-LOGIC-04 (migration 047) webhook.
 *
 * The old tests asserted on supabase.from(...).upsert(...) call shape. That
 * interface no longer exists — the route now calls the `finalize_payment`
 * RPC, and all DB writes happen server-side within a single transaction.
 *
 * What we actually want to verify in this layer:
 *   1. Missing / invalid signature → 4xx, no DB calls.
 *   2. Event-id idempotency: a duplicate Stripe event returns 200 with
 *      `duplicate: true` and does NOT call finalize_payment.
 *   3. A successful checkout.session.completed resolves the payment_intent,
 *      calls finalize_payment with the mapped status + amount, and
 *      schedules notifications only if !was_duplicate.
 *   4. An amount-mismatch RPC result returns 400 and does NOT notify.
 *   5. A finalize_payment RPC error returns 500 so Stripe retries.
 *   6. payment_intent.payment_failed passes `null` amount (tamper check is
 *      skipped for failure events).
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

vi.mock('@/lib/payments/stripe', () => ({
  verifyStripeWebhookSignature: vi.fn(),
  mapStripeStatus: vi.fn(),
  getStripePaymentIntent: vi.fn(),
}));

vi.mock('@/lib/payments/notifyAfterFinalize', () => ({
  notifyAfterFinalize: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { POST } from './route';
import { verifyStripeWebhookSignature, mapStripeStatus, getStripePaymentIntent } from '@/lib/payments/stripe';
import { notifyAfterFinalize } from '@/lib/payments/notifyAfterFinalize';
import { createClient } from '@supabase/supabase-js';

// ── Mock Supabase ──────────────────────────────────────────────────

/**
 * Build a Supabase mock that:
 *   - Accepts an .insert({ event_id, gateway }) on processed_webhook_events
 *     and returns either a success or a 23505 (unique violation) depending
 *     on `isDuplicate`.
 *   - Accepts a .rpc('finalize_payment', ...) call and returns whatever the
 *     test configured in `rpcResult`.
 */
function mockSupabase(opts: {
  isDuplicate?: boolean;
  rpcResult?: {
    data?: Record<string, unknown>;
    error?: { message: string } | null;
  };
}) {
  const insertFn = vi.fn().mockResolvedValue({
    error: opts.isDuplicate ? { code: '23505', message: 'duplicate' } : null,
  });
  const rpcFn = vi.fn().mockResolvedValue({
    data: opts.rpcResult?.data ?? { success: true, was_duplicate: false, payment_id: 'pay-123' },
    error: opts.rpcResult?.error ?? null,
  });

  return {
    from: vi.fn().mockReturnValue({
      insert: insertFn,
    }),
    rpc: rpcFn,
    __insertFn: insertFn,
    __rpcFn: rpcFn,
  };
}

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/payment/webhook/stripe', {
    method: 'POST',
    body,
    headers: new Headers(headers),
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POST /api/payment/webhook/stripe', () => {
  beforeEach(() => {
    // clearAllMocks (not resetAllMocks) so vi.mock-defined default
    // implementations (notifyAfterFinalize → resolved promise) survive.
    // resetAllMocks wipes the implementations and makes the mock return
    // undefined, which then makes `.catch()` throw.
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = 'cron-secret';
  });

  it('returns 400 when stripe-signature is missing', async () => {
    const res = await POST(request('{}'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when signature verification fails', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue(null);
    const res = await POST(request('{}', { 'stripe-signature': 'bad' }));
    expect(res.status).toBe(401);
  });

  it('short-circuits on duplicate event id without calling finalize_payment', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      id: 'evt_dup_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_dup_1', status: 'succeeded', amount_received: 1000 } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({ isDuplicate: true });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(supabase.__rpcFn).not.toHaveBeenCalled();
    expect(notifyAfterFinalize).not.toHaveBeenCalled();
  });

  it('finalizes payment_intent.succeeded and notifies on first-approval', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', status: 'succeeded', amount_received: 2500 } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      rpcResult: {
        data: { success: true, was_duplicate: false, payment_id: 'pay-1' },
      },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
    expect(res.status).toBe(200);

    expect(supabase.__rpcFn).toHaveBeenCalledWith('finalize_payment', {
      p_gateway_payment_id: 'pi_1',
      p_expected_amount_cents: 2500,
      p_gateway: 'stripe',
      p_new_status: 'approved',
    });
    expect(notifyAfterFinalize).toHaveBeenCalledWith(supabase, 'pay-1');
  });

  it('does NOT notify when finalize reports was_duplicate', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      id: 'evt_2',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_2', status: 'succeeded', amount_received: 1000 } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      rpcResult: { data: { success: true, was_duplicate: true, payment_id: 'pay-2' } },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
    expect(res.status).toBe(200);
    expect(notifyAfterFinalize).not.toHaveBeenCalled();
  });

  it('returns 400 when finalize reports amount_mismatch', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      id: 'evt_tamper',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_tamper', status: 'succeeded', amount_received: 999 } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      rpcResult: {
        data: { success: false, error: 'amount_mismatch', expected: 1000, received: 999 },
      },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('amount_mismatch');
    expect(notifyAfterFinalize).not.toHaveBeenCalled();
  });

  it('returns 500 when finalize RPC errors so Stripe retries', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      id: 'evt_err',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_err', status: 'succeeded', amount_received: 1000 } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      rpcResult: { error: { message: 'db down' } },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
    expect(res.status).toBe(500);
  });

  it('passes null amount on payment_intent.payment_failed (skips tamper check)', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      id: 'evt_fail',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_fail', status: 'requires_payment_method' } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('declined' as never);

    const supabase = mockSupabase({
      rpcResult: { data: { success: true, was_duplicate: false } },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
    expect(res.status).toBe(200);

    expect(supabase.__rpcFn).toHaveBeenCalledWith('finalize_payment', {
      p_gateway_payment_id: 'pi_fail',
      p_expected_amount_cents: null,
      p_gateway: 'stripe',
      p_new_status: 'declined',
    });
  });

  it('resolves payment_intent for checkout.session.completed before finalizing', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      id: 'evt_co',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', payment_intent: 'pi_co' } },
    } as never);
    vi.mocked(getStripePaymentIntent).mockResolvedValue({
      status: 'succeeded',
      amount_received: 3500,
      amount: 3500,
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      rpcResult: { data: { success: true, was_duplicate: false, payment_id: 'pay-co' } },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
    expect(res.status).toBe(200);

    expect(getStripePaymentIntent).toHaveBeenCalledWith('pi_co');
    expect(supabase.__rpcFn).toHaveBeenCalledWith('finalize_payment', {
      p_gateway_payment_id: 'cs_1',
      p_expected_amount_cents: 3500,
      p_gateway: 'stripe',
      p_new_status: 'approved',
    });
  });
});
