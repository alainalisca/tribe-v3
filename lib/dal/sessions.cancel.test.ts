import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for lib/dal/sessions.ts:cancelSession.
 *
 * Rewritten 2026-04-21 against the current contract. The critical paths:
 *
 *   - returns Session not found when the initial select fails
 *   - refuses to cancel an already-cancelled session
 *   - refuses to cancel a completed session
 *   - happy path (free session): updates participants → cancelled and
 *     sessions → cancelled
 *   - paid session: calls createStripeRefund for stripe payments, marks
 *     refunded; calls createWompiRefund for wompi; marks refund_failed
 *     when the refund API returns success:false
 *   - propagates DB update errors from the session row
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => ({
  createStripeRefund: vi.fn(),
}));
vi.mock('@/lib/payments/wompi', () => ({
  createWompiRefund: vi.fn(),
}));

import { cancelSession } from './sessions';
import { createStripeRefund } from '@/lib/payments/stripe';
import { createWompiRefund } from '@/lib/payments/wompi';

// ── Mock builder ───────────────────────────────────────────────────
// cancelSession performs this sequence of queries:
//   1. sessions.select(fields).eq('id', id).single()  → session row
//   2. session_participants.select('user_id').eq('session_id',id).eq('status','confirmed')
//   3. (paid only) payments.select(...).eq('session_id',id).eq('status','approved')
//   4. (paid only, per payment) payments.update(...).eq('id', paymentId)
//   5. session_participants.update({status:'cancelled'}).eq('session_id',id)
//   6. sessions.update({status:'cancelled',...}).eq('id',id)  → { error }

interface PaymentRow {
  id: string;
  gateway: 'stripe' | 'wompi';
  stripe_payment_intent_id?: string | null;
  gateway_payment_id?: string | null;
  amount_cents?: number | null;
}

function makeSupabase(opts: {
  session?: Record<string, unknown> | null;
  sessionError?: { message: string } | null;
  participants?: Array<{ user_id: string }>;
  payments?: PaymentRow[];
  updateSessionError?: { message: string } | null;
}) {
  const sessionSingle = vi.fn().mockResolvedValue({
    data: opts.session ?? null,
    error: opts.sessionError ?? null,
  });
  const participantsSelect = vi.fn().mockResolvedValue({
    data: opts.participants ?? [],
    error: null,
  });
  const paymentsSelect = vi.fn().mockResolvedValue({
    data: opts.payments ?? [],
    error: null,
  });
  const paymentsUpdate = vi.fn().mockResolvedValue({ error: null });
  const participantsUpdate = vi.fn().mockResolvedValue({ error: null });
  const sessionsUpdate = vi.fn().mockResolvedValue({ error: opts.updateSessionError ?? null });

  const from = vi.fn((table: string) => {
    if (table === 'sessions') {
      return {
        select: () => ({
          eq: () => ({ single: sessionSingle }),
        }),
        update: () => ({ eq: sessionsUpdate }),
      };
    }
    if (table === 'session_participants') {
      return {
        select: () => ({
          eq: () => ({ eq: participantsSelect }),
        }),
        update: () => ({ eq: participantsUpdate }),
      };
    }
    if (table === 'payments') {
      return {
        select: () => ({
          eq: () => ({ eq: paymentsSelect }),
        }),
        update: () => ({ eq: paymentsUpdate }),
      };
    }
    return {};
  });

  return {
    from,
    __sessionSingle: sessionSingle,
    __sessionsUpdate: sessionsUpdate,
    __participantsUpdate: participantsUpdate,
    __paymentsUpdate: paymentsUpdate,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('cancelSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // fetch is used for per-participant notifications — stub so calls don't
    // actually reach out. Tests don't assert on it.
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = 'test-secret';
  });

  it('returns Session not found when the initial select fails', async () => {
    const s = makeSupabase({ session: null, sessionError: { message: 'not found' } });
    const res = await cancelSession(s as never, 'sess-x');
    expect(res).toEqual({ success: false, error: 'Session not found' });
  });

  it('refuses to cancel an already-cancelled session', async () => {
    const s = makeSupabase({
      session: { id: 'sess-x', title: 't', creator_id: 'c', is_paid: false, status: 'cancelled' },
    });
    const res = await cancelSession(s as never, 'sess-x');
    expect(res).toEqual({ success: false, error: 'Session is already cancelled' });
  });

  it('refuses to cancel a completed session', async () => {
    const s = makeSupabase({
      session: { id: 'sess-x', title: 't', creator_id: 'c', is_paid: false, status: 'completed' },
    });
    const res = await cancelSession(s as never, 'sess-x');
    expect(res).toEqual({ success: false, error: 'Cannot cancel a completed session' });
  });

  it('happy path: cancels participants and the session (free)', async () => {
    const s = makeSupabase({
      session: { id: 'sess-1', title: 'Run', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [{ user_id: 'u-1' }, { user_id: 'u-2' }],
    });
    const res = await cancelSession(s as never, 'sess-1');
    expect(res).toEqual({ success: true });
    expect(s.__participantsUpdate).toHaveBeenCalled();
    expect(s.__sessionsUpdate).toHaveBeenCalled();
  });

  it('paid session: calls stripe refund API and marks payment refunded', async () => {
    vi.mocked(createStripeRefund).mockResolvedValue({ success: true } as never);
    const s = makeSupabase({
      session: { id: 'sess-p', title: 'Paid', creator_id: 'c', is_paid: true, status: 'active' },
      participants: [],
      payments: [{ id: 'pay-1', gateway: 'stripe', stripe_payment_intent_id: 'pi_1', amount_cents: 1000 }],
    });
    await cancelSession(s as never, 'sess-p');
    expect(createStripeRefund).toHaveBeenCalledWith('pi_1');
    expect(s.__paymentsUpdate).toHaveBeenCalled();
  });

  it('paid session: calls wompi refund API when payment is wompi', async () => {
    vi.mocked(createWompiRefund).mockResolvedValue({ success: true } as never);
    const s = makeSupabase({
      session: { id: 'sess-p', title: 'Paid', creator_id: 'c', is_paid: true, status: 'active' },
      payments: [{ id: 'pay-w', gateway: 'wompi', gateway_payment_id: 'txn_1', amount_cents: 50000 }],
    });
    await cancelSession(s as never, 'sess-p');
    expect(createWompiRefund).toHaveBeenCalledWith('txn_1', 50000);
    expect(s.__paymentsUpdate).toHaveBeenCalled();
  });

  it('marks payment refund_failed when the refund API returns success:false', async () => {
    vi.mocked(createStripeRefund).mockResolvedValue({ success: false, error: 'declined' } as never);
    const s = makeSupabase({
      session: { id: 'sess-p', title: 'Paid', creator_id: 'c', is_paid: true, status: 'active' },
      payments: [{ id: 'pay-1', gateway: 'stripe', stripe_payment_intent_id: 'pi_1', amount_cents: 1000 }],
    });
    // This should still return success=true — cancellation proceeds, but
    // the payment row is flagged refund_failed for manual follow-up.
    const res = await cancelSession(s as never, 'sess-p');
    expect(res.success).toBe(true);
    expect(s.__paymentsUpdate).toHaveBeenCalled();
  });

  it('propagates DB update errors from the session row', async () => {
    const s = makeSupabase({
      session: { id: 'sess-e', title: 't', creator_id: 'c', is_paid: false, status: 'active' },
      updateSessionError: { message: 'update failed' },
    });
    const res = await cancelSession(s as never, 'sess-e');
    expect(res).toEqual({ success: false, error: 'update failed' });
  });
});
