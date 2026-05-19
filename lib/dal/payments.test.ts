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

/**
 * Richer mock for the seat-release path: a payments chain
 * (update→eq→select→single) plus a session_participants chain
 * (delete→eq→eq) whose call is recorded so tests can assert whether the
 * seat was released.
 */
function buildSeatMock(opts: {
  payment: { id: string; amount_cents: number | null; session_id: string | null; participant_user_id: string | null };
  seatDeleteError?: { message: string } | null;
}) {
  const calls = { deleteArgs: [] as Array<[string, unknown]>, deleteCalled: false };
  const paymentsChain = {
    update: () => paymentsChain,
    eq: () => paymentsChain,
    select: () => paymentsChain,
    single: async () => ({ data: opts.payment, error: null }),
  };
  // recordPaymentRefund does: .delete().eq('session_id',…).eq('user_id',…)
  // and awaits the result, so the last .eq() must resolve to { error }.
  const spChain = {
    delete: () => {
      calls.deleteCalled = true;
      return spChain;
    },
    eq: (col: string, val: unknown) => {
      calls.deleteArgs.push([col, val]);
      return calls.deleteArgs.length >= 2 ? Promise.resolve({ error: opts.seatDeleteError ?? null }) : spChain;
    },
  };
  const supabase = {
    from: (table: string) => (table === 'session_participants' ? spChain : paymentsChain),
  } as unknown as SupabaseClient;
  return { supabase, calls };
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

  it('releases the session seat on a FULL refund', async () => {
    const { supabase, calls } = buildSeatMock({
      payment: { id: 'pay_full', amount_cents: 2500, session_id: 'sess-9', participant_user_id: 'buyer-9' },
    });
    const res = await recordPaymentRefund(supabase, PI, 2500, AT);
    expect(res).toEqual({ success: true, data: { paymentId: 'pay_full' } });
    expect(calls.deleteCalled).toBe(true);
    expect(calls.deleteArgs).toEqual([
      ['session_id', 'sess-9'],
      ['user_id', 'buyer-9'],
    ]);
  });

  it('keeps the seat on a PARTIAL refund', async () => {
    const { supabase, calls } = buildSeatMock({
      payment: { id: 'pay_part', amount_cents: 2500, session_id: 'sess-9', participant_user_id: 'buyer-9' },
    });
    const res = await recordPaymentRefund(supabase, PI, 1000, AT);
    expect(res).toEqual({ success: true, data: { paymentId: 'pay_part' } });
    expect(calls.deleteCalled).toBe(false);
  });

  it('no-ops the seat release for a non-session (boost/pro) payment', async () => {
    const { supabase, calls } = buildSeatMock({
      payment: { id: 'pay_boost', amount_cents: 9900, session_id: null, participant_user_id: null },
    });
    const res = await recordPaymentRefund(supabase, PI, 9900, AT);
    expect(res).toEqual({ success: true, data: { paymentId: 'pay_boost' } });
    expect(calls.deleteCalled).toBe(false);
  });

  it('still records the refund when the seat release fails', async () => {
    const { supabase } = buildSeatMock({
      payment: { id: 'pay_seaterr', amount_cents: 2500, session_id: 'sess-9', participant_user_id: 'buyer-9' },
      seatDeleteError: { message: 'rls denied' },
    });
    const res = await recordPaymentRefund(supabase, PI, 2500, AT);
    // The refund itself is recorded; a failed seat delete must not fail it.
    expect(res).toEqual({ success: true, data: { paymentId: 'pay_seaterr' } });
  });
});
