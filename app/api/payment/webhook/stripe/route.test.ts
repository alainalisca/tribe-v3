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
  notifyTipReceived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/dal/tribeOSSubscription', () => ({
  syncFromStripeSubscription: vi.fn(),
  clearTribeOSSubscription: vi.fn(),
}));

vi.mock('@/lib/dal/payments', () => ({
  recordPaymentRefund: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { POST } from './route';
import { verifyStripeWebhookSignature, mapStripeStatus, getStripePaymentIntent } from '@/lib/payments/stripe';
import { notifyAfterFinalize } from '@/lib/payments/notifyAfterFinalize';
import { syncFromStripeSubscription, clearTribeOSSubscription } from '@/lib/dal/tribeOSSubscription';
import { recordPaymentRefund } from '@/lib/dal/payments';
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

  // ─────────────────────────────────────────────────────────────────
  // Subscription lifecycle (Tribe.OS premium billing)
  // ─────────────────────────────────────────────────────────────────
  //
  // The webhook is the source of truth for premium status. These
  // tests pin the dispatch contract: which event types call which
  // DAL function, and how the route maps DAL errors to HTTP codes.
  // Stripe's retry behavior depends on the status code:
  //   - 200 = "got it, don't retry"
  //   - 5xx = "transient, retry me"
  //   - 4xx = "bad shape, but don't retry"
  // Getting these wrong means either lost events (false 200) or
  // an infinite retry storm (false 5xx). We pin the mapping.

  describe('subscription lifecycle', () => {
    it('subscription.created routes to syncFromStripeSubscription and returns userId', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_sub_created',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_1',
            customer: 'cus_1',
            status: 'active',
            items: { data: [{ price: { id: 'price_solo' } }] },
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(syncFromStripeSubscription).mockResolvedValue({
        success: true,
        data: { userId: 'user-1', tier: 'solo', status: 'active' },
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.userId).toBe('user-1');
      expect(syncFromStripeSubscription).toHaveBeenCalledWith(
        supabase,
        expect.objectContaining({ id: 'sub_1', customer: 'cus_1', status: 'active' })
      );
    });

    it('subscription.updated also routes to syncFromStripeSubscription (shared branch)', async () => {
      // The route handler groups subscription.created + .updated into
      // the same case. We pin that by asserting the same DAL function
      // is called on .updated.
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_2',
            customer: 'cus_2',
            status: 'past_due',
            items: { data: [{ price: { id: 'price_team' } }] },
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(syncFromStripeSubscription).mockResolvedValue({
        success: true,
        data: { userId: 'user-2', tier: 'team_studio', status: 'past_due' },
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      expect(res.status).toBe(200);
      expect(syncFromStripeSubscription).toHaveBeenCalled();
    });

    it('subscription event for an unknown customer returns 200 (benign)', async () => {
      // user_not_found_for_stripe_customer means the subscription is
      // for a customer we never tagged with a Tribe user (testing,
      // overlap with another product on the same Stripe account).
      // Returning 5xx would make Stripe retry forever; we 200 so
      // it stops.
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_sub_orphan',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_orphan',
            customer: 'cus_orphan',
            status: 'active',
            items: { data: [{ price: { id: 'price_solo' } }] },
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(syncFromStripeSubscription).mockResolvedValue({
        success: false,
        error: 'user_not_found_for_stripe_customer',
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ignored).toBe(true);
    });

    it('subscription sync DB error returns 500 so Stripe retries', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_sub_db_error',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_3',
            customer: 'cus_3',
            status: 'active',
            items: { data: [{ price: { id: 'price_solo' } }] },
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(syncFromStripeSubscription).mockResolvedValue({
        success: false,
        error: 'db_timeout',
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      expect(res.status).toBe(500);
    });

    it('subscription.deleted routes to clearTribeOSSubscription', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_4', customer: 'cus_4' } },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(clearTribeOSSubscription).mockResolvedValue({
        success: true,
        data: { userId: 'user-4' },
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.userId).toBe('user-4');
      expect(clearTribeOSSubscription).toHaveBeenCalledWith(supabase, 'cus_4');
    });

    it('subscription.deleted for an unknown customer returns 200 (benign)', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_sub_del_orphan',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_5', customer: 'cus_orphan' } },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(clearTribeOSSubscription).mockResolvedValue({
        success: false,
        error: 'user_not_found_for_stripe_customer',
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ignored).toBe(true);
    });

    it('invoice.paid acknowledges with 200 without writing (sync happens via subscription.updated)', async () => {
      // invoice.paid is fired alongside customer.subscription.updated.
      // We ack with 200 so Stripe stops retrying, but the state-sync
      // happens via the subscription branch. The DAL should NOT be
      // called from the invoice branch.
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_inv_paid',
        type: 'invoice.paid',
        data: { object: { id: 'in_1', subscription: 'sub_1' } },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      expect(res.status).toBe(200);
      expect(syncFromStripeSubscription).not.toHaveBeenCalled();
      expect(clearTribeOSSubscription).not.toHaveBeenCalled();
    });

    it('invoice.payment_failed also acks with 200 (dunning is downstream)', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_inv_failed',
        type: 'invoice.payment_failed',
        data: { object: { id: 'in_2', subscription: 'sub_2' } },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Refund tracking (charge.refunded)
  // ─────────────────────────────────────────────────────────────────

  describe('charge.refunded', () => {
    it('records the refund and returns the resulting payment id', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_refund_1',
        created: 1_700_000_000,
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_1',
            payment_intent: 'pi_refunded',
            amount_refunded: 1500,
            currency: 'usd',
            created: 1_699_999_900,
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(recordPaymentRefund).mockResolvedValue({
        success: true,
        data: { paymentId: 'pay-refunded' },
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.paymentId).toBe('pay-refunded');
      // Refund time uses the event.created timestamp, not the charge.created.
      // Pinning this because the event timestamp is what audit / reconciliation
      // joins against; getting it wrong would silently produce a different
      // 'refunded_at' than Stripe's view.
      expect(recordPaymentRefund).toHaveBeenCalledWith(
        supabase,
        'pi_refunded',
        1500,
        new Date(1_700_000_000 * 1000).toISOString()
      );
    });

    it('returns 200 with ignored=true when the charge has no payment_intent', async () => {
      // Legacy Charges API (no payment_intent). Not something our
      // flow produces, but Stripe can deliver it on accounts that
      // also use the legacy API. We ack so Stripe stops retrying.
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_refund_legacy',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_legacy',
            payment_intent: null,
            amount_refunded: 500,
            currency: 'usd',
            created: 1_699_999_900,
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ignored).toBe(true);
      expect(recordPaymentRefund).not.toHaveBeenCalled();
    });

    it('returns 200 ignored when payment_not_found (refund of a payment we never recorded)', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_refund_orphan',
        created: 1_700_000_000,
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_orphan',
            payment_intent: 'pi_orphan',
            amount_refunded: 1000,
            currency: 'usd',
            created: 1_699_999_900,
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(recordPaymentRefund).mockResolvedValue({
        success: false,
        error: 'payment_not_found',
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ignored).toBe(true);
      expect(body.reason).toBe('payment_not_found');
    });

    it('returns 500 on unknown refund DAL error so Stripe retries', async () => {
      vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
        id: 'evt_refund_dberr',
        created: 1_700_000_000,
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_dberr',
            payment_intent: 'pi_dberr',
            amount_refunded: 1000,
            currency: 'usd',
            created: 1_699_999_900,
          },
        },
      } as never);

      const supabase = mockSupabase({});
      vi.mocked(createClient).mockReturnValue(supabase as never);
      vi.mocked(recordPaymentRefund).mockResolvedValue({
        success: false,
        error: 'unexpected_db_error',
      } as never);

      const res = await POST(request('{}', { 'stripe-signature': 'ok' }));
      expect(res.status).toBe(500);
    });
  });
});
