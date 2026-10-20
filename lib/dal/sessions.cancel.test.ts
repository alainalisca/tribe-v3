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
import { logError } from '@/lib/logger';
import { createStripeRefund } from '@/lib/payments/stripe';
import { createWompiRefund } from '@/lib/payments/wompi';

// ── Mock builder ───────────────────────────────────────────────────
// cancelSession performs this sequence of queries:
//   1. sessions.select(fields).eq('id', id).single()  → session row
//   2. session_participants.select('id, user_id').eq('session_id',id).eq('status','confirmed')
//   3. sessions.update({status:'cancelled',...}).eq('id',id)  → { error }
//   4. (paid only) payments.select(...).eq('session_id',id).eq('status','approved')
//   5. (paid only, per payment) payments.update(...).eq('id', paymentId)
//   6. session_participants.update({status:'cancelled'}).eq('session_id',id)

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
  participants?: Array<{ id?: string; user_id: string }>;
  payments?: PaymentRow[];
  updateSessionError?: { message: string } | null;
  updateParticipantsError?: { message: string } | null;
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
  const participantsUpdate = vi.fn().mockResolvedValue({ error: opts.updateParticipantsError ?? null });
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
    // fetch carries the notify call to /api/sessions/notify-cancel; stubbed so
    // nothing reaches out. The notify tests below assert on it.
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

  // ── order: the session row first ─────────────────────────────────

  it('cancels the session row before the participant rows', async () => {
    const s = makeSupabase({
      session: { id: 'sess-1', title: 'Run', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [{ id: 'p-1', user_id: 'u-1' }],
    });
    await cancelSession(s as never, 'sess-1');
    expect(s.__sessionsUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      s.__participantsUpdate.mock.invocationCallOrder[0]
    );
  });

  it('a failed session update leaves the participant rows and payments untouched', async () => {
    vi.mocked(createStripeRefund).mockResolvedValue({ success: true } as never);
    const s = makeSupabase({
      session: { id: 'sess-p', title: 'Paid', creator_id: 'c', is_paid: true, status: 'active' },
      participants: [{ id: 'p-1', user_id: 'u-1' }],
      payments: [{ id: 'pay-1', gateway: 'stripe', stripe_payment_intent_id: 'pi_1', amount_cents: 1000 }],
      updateSessionError: { message: 'total_participants_served can only be changed by an admin' },
    });
    const res = await cancelSession(s as never, 'sess-p');
    expect(res).toEqual({ success: false, error: 'total_participants_served can only be changed by an admin' });
    expect(s.__participantsUpdate).not.toHaveBeenCalled();
    expect(createStripeRefund).not.toHaveBeenCalled();
    expect(s.__paymentsUpdate).not.toHaveBeenCalled();
  });

  it('a failed participant update after the session is cancelled is logged; the cancel stands', async () => {
    const s = makeSupabase({
      session: { id: 'sess-1', title: 'Run', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [{ id: 'p-1', user_id: 'u-1' }],
      updateParticipantsError: { message: 'rls' },
    });
    const res = await cancelSession(s as never, 'sess-1');
    expect(res).toEqual({ success: true });
    expect(logError).toHaveBeenCalledWith(
      { message: 'rls' },
      expect.objectContaining({ action: 'cancelSession_participants', sessionId: 'sess-1' })
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ── the cancel push (server route since fix/cancel-push-server) ──

  it('asks the notify route with the participant row ids, never the push route or a secret', async () => {
    const s = makeSupabase({
      session: { id: 'sess-1', title: 'Run', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [
        { id: 'p-1', user_id: 'u-1' },
        { id: 'p-2', user_id: 'u-2' },
      ],
    });
    await cancelSession(s as never, 'sess-1');
    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe('/api/sessions/notify-cancel/');
    expect(JSON.parse(init.body)).toEqual({ session_id: 'sess-1', participant_ids: ['p-1', 'p-2'] });
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.body).not.toContain('test-secret');
  });

  it('no confirmed participants: no notify call', async () => {
    const s = makeSupabase({
      session: { id: 'sess-1', title: 'Run', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [],
    });
    await cancelSession(s as never, 'sess-1');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('the notify call rejecting never undoes or fails the cancel', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as never;
    const s = makeSupabase({
      session: { id: 'sess-1', title: 'Run', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [{ id: 'p-1', user_id: 'u-1' }],
    });
    const res = await cancelSession(s as never, 'sess-1');
    expect(res).toEqual({ success: true });
    expect(s.__sessionsUpdate).toHaveBeenCalled();
  });

  it('the notify call throwing synchronously never fails the cancel', async () => {
    global.fetch = vi.fn(() => {
      throw new Error('fetch unavailable');
    }) as never;
    const s = makeSupabase({
      session: { id: 'sess-1', title: 'Run', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [{ id: 'p-1', user_id: 'u-1' }],
    });
    const res = await cancelSession(s as never, 'sess-1');
    expect(res).toEqual({ success: true });
  });

  it('a failed session update sends no notify call', async () => {
    const s = makeSupabase({
      session: { id: 'sess-e', title: 't', creator_id: 'c', is_paid: false, status: 'active' },
      participants: [{ id: 'p-1', user_id: 'u-1' }],
      updateSessionError: { message: 'update failed' },
    });
    await cancelSession(s as never, 'sess-e');
    expect(global.fetch).not.toHaveBeenCalled();
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
