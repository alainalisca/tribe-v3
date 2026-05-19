/**
 * Tests for recordPaymentRefund (lib/dal/payments.ts).
 *
 * Why these matter: this function is the only thing that writes a
 * refund back onto the payments row. The Tier-1 audit found refunds
 * were silently dropped because the row's stripe_payment_intent_id
 * held a cs_ Checkout-Session id while charge.refunded looks up by a
 * pi_ PaymentIntent id (now backfilled by the webhook). These tests
 * pin every branch so a regression that returns success on a missed
 * lookup — which would leave refunded money counted as revenue —
 * fails CI loudly.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordPaymentRefund } from './payments';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

/**
 * Mock pinned to recordPaymentRefund's exact chain:
 *   .from('payments').update({...}).eq(...).select('id').single()
 */
function buildSupabaseMock(opts: { data?: { id: string } | null; error?: { message: string } | null }): SupabaseClient {
  const chain = {
    update: () => chain,
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: opts.data ?? null, error: opts.error ?? null }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const PI = 'pi_test_123';
const AT = '2026-05-19T12:00:00.000Z';

describe('recordPaymentRefund', () => {
  it('rejects a missing payment-intent id without touching the DB', async () => {
    const supabase = buildSupabaseMock({});
    const res = await recordPaymentRefund(supabase, '', 500, AT);
    expect(res).toEqual({ success: false, error: 'missing_payment_intent_id' });
  });

  it('rejects a zero refund amount', async () => {
    const res = await recordPaymentRefund(buildSupabaseMock({}), PI, 0, AT);
    expect(res).toEqual({ success: false, error: 'invalid_refund_amount' });
  });

  it('rejects a negative refund amount', async () => {
    const res = await recordPaymentRefund(buildSupabaseMock({}), PI, -100, AT);
    expect(res).toEqual({ success: false, error: 'invalid_refund_amount' });
  });

  it('rejects a non-finite refund amount', async () => {
    const res = await recordPaymentRefund(buildSupabaseMock({}), PI, Number.NaN, AT);
    expect(res).toEqual({ success: false, error: 'invalid_refund_amount' });
  });

  it('surfaces the DB error message when the update fails', async () => {
    const supabase = buildSupabaseMock({ error: { message: 'permission denied' } });
    const res = await recordPaymentRefund(supabase, PI, 1500, AT);
    expect(res).toEqual({ success: false, error: 'permission denied' });
  });

  it('returns payment_not_found when no row matches the payment intent', async () => {
    // This is the exact failure the audit caught: a refund for a row
    // we never matched. It MUST report failure, never silent success.
    const supabase = buildSupabaseMock({ data: null });
    const res = await recordPaymentRefund(supabase, PI, 1500, AT);
    expect(res).toEqual({ success: false, error: 'payment_not_found' });
  });

  it('returns the payment id on a successful refund record', async () => {
    const supabase = buildSupabaseMock({ data: { id: 'pay_abc' } });
    const res = await recordPaymentRefund(supabase, PI, 1500, AT);
    expect(res).toEqual({ success: true, data: { paymentId: 'pay_abc' } });
  });
});
