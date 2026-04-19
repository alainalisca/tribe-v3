import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { cancelSession } from './sessions';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => ({
  createStripeRefund: vi.fn(),
}));
vi.mock('@/lib/payments/wompi', () => ({
  createWompiRefund: vi.fn(),
}));

interface CancelMockOpts {
  session?: Record<string, unknown> | null;
  sessionError?: { message: string } | null;
  participants?: Array<{ user_id: string }>;
  payments?: Array<Record<string, unknown>>;
  updateError?: { message: string } | null;
}

function createCancelMockSupabase(opts: CancelMockOpts = {}) {
  const {
    session = {
      id: 'session-1',
      title: 'Morning Run',
      creator_id: 'creator-1',
      is_paid: false,
      price_cents: 0,
      currency: 'usd',
      status: 'active',
    },
    sessionError = null,
    participants = [],
    payments = [],
    updateError = null,
  } = opts;

  // Track update calls for assertions
  const updateCalls: Array<{ table: string; data: unknown; eqField: string; eqValue: unknown }> = [];

  const mock = {
    updateCalls,
    from: (table: string) => {
      // Build a chain that handles the sequences used by cancelSession
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: sessionError ? null : session,
                error: sessionError,
              }),
            }),
          }),
          update: (data: unknown) => ({
            eq: (_field: string, value: unknown) => {
              updateCalls.push({ table: 'sessions', data, eqField: _field, eqValue: value });
              return Promise.resolve({ error: updateError });
            },
          }),
        };
      }

      if (table === 'session_participants') {
        return {
          select: () => ({
            eq: (_f: string) => ({
              eq: () =>
                Promise.resolve({
                  data: participants,
                  error: null,
                }),
            }),
          }),
          update: (data: unknown) => ({
            eq: (_field: string, value: unknown) => {
              updateCalls.push({ table: 'session_participants', data, eqField: _field, eqValue: value });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      if (table === 'payments') {
        return {
          select: () => ({
            eq: (_f: string) => ({
              eq: () =>
                Promise.resolve({
                  data: payments,
                  error: null,
                }),
            }),
          }),
          update: (data: unknown) => ({
            eq: (_field: string, value: unknown) => {
              updateCalls.push({ table: 'payments', data, eqField: _field, eqValue: value });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      // Fallback
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };

  return mock as unknown as SupabaseClient & { updateCalls: typeof updateCalls };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('cancelSession', () => {
  let fetchSpy: Mock;

  beforeEach(() => {
    vi.resetAllMocks();
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://tribe.test';
    process.env.CRON_SECRET = 'test-secret';
  });

  // 1. Session not found
  it('returns error when session not found', async () => {
    const supabase = createCancelMockSupabase({
      session: null,
      sessionError: { message: 'Row not found' },
    });

    const result = await cancelSession(supabase, 'nonexistent');

    expect(result).toEqual({ success: false, error: 'Session not found' });
  });

  // 2. Already cancelled
  it('rejects cancellation of already-cancelled session', async () => {
    const supabase = createCancelMockSupabase({
      session: {
        id: 'session-1',
        title: 'Morning Run',
        creator_id: 'creator-1',
        is_paid: false,
        price_cents: 0,
        currency: 'usd',
        status: 'cancelled',
      },
    });

    const result = await cancelSession(supabase, 'session-1');

    expect(result).toEqual({ success: false, error: 'Session is already cancelled' });
  });

  // 3. Completed session
  it('rejects cancellation of completed session', async () => {
    const supabase = createCancelMockSupabase({
      session: {
        id: 'session-1',
        title: 'Morning Run',
        creator_id: 'creator-1',
        is_paid: false,
        price_cents: 0,
        currency: 'usd',
        status: 'completed',
      },
    });

    const result = await cancelSession(supabase, 'session-1');

    expect(result).toEqual({ success: false, error: 'Cannot cancel a completed session' });
  });

  // 4. Paid session: calls refund APIs and marks payments
  it('calls refund APIs and marks payments as refunded for paid sessions', async () => {
    const { createStripeRefund } = await import('@/lib/payments/stripe');
    const { createWompiRefund } = await import('@/lib/payments/wompi');

    (createStripeRefund as Mock).mockResolvedValue({ success: true });
    (createWompiRefund as Mock).mockResolvedValue({ success: true });

    const supabase = createCancelMockSupabase({
      session: {
        id: 'session-1',
        title: 'Paid HIIT Class',
        creator_id: 'creator-1',
        is_paid: true,
        price_cents: 5000,
        currency: 'usd',
        status: 'active',
      },
      participants: [{ user_id: 'user-a' }, { user_id: 'user-b' }],
      payments: [
        {
          id: 'pay-1',
          participant_user_id: 'user-a',
          amount_cents: 5000,
          currency: 'usd',
          payment_gateway: 'stripe',
          stripe_payment_intent_id: 'pi_abc',
          wompi_transaction_id: null,
        },
        {
          id: 'pay-2',
          participant_user_id: 'user-b',
          amount_cents: 5000,
          currency: 'cop',
          payment_gateway: 'wompi',
          stripe_payment_intent_id: null,
          wompi_transaction_id: 'wompi_xyz',
        },
      ],
    });

    const result = await cancelSession(supabase, 'session-1');

    expect(result.success).toBe(true);

    // Verify refund APIs were called
    expect(createStripeRefund).toHaveBeenCalledWith('pi_abc');
    expect(createWompiRefund).toHaveBeenCalledWith('wompi_xyz', 5000);

    // Verify payment records were updated to 'refunded'
    const paymentUpdates = supabase.updateCalls.filter((c) => c.table === 'payments');
    expect(paymentUpdates).toHaveLength(2);
    expect((paymentUpdates[0].data as Record<string, unknown>).status).toBe('refunded');
    expect((paymentUpdates[1].data as Record<string, unknown>).status).toBe('refunded');
    expect((paymentUpdates[0].data as Record<string, unknown>).payout_status).toBe('cancelled');
  });

  // 5. Updates all participants to cancelled status
  it('updates all participants to cancelled status', async () => {
    const supabase = createCancelMockSupabase({
      session: {
        id: 'session-1',
        title: 'Morning Run',
        creator_id: 'creator-1',
        is_paid: false,
        price_cents: 0,
        currency: 'usd',
        status: 'active',
      },
      participants: [{ user_id: 'user-a' }, { user_id: 'user-b' }],
    });

    const result = await cancelSession(supabase, 'session-1');

    expect(result.success).toBe(true);

    // Verify session_participants update was called with status: 'cancelled'
    const participantUpdates = supabase.updateCalls.filter(
      (c) => c.table === 'session_participants'
    );
    expect(participantUpdates).toHaveLength(1);
    expect(participantUpdates[0].data).toEqual({ status: 'cancelled' });
    expect(participantUpdates[0].eqValue).toBe('session-1');

    // Verify session status was updated to 'cancelled'
    const sessionUpdates = supabase.updateCalls.filter((c) => c.table === 'sessions');
    expect(sessionUpdates).toHaveLength(1);
    expect((sessionUpdates[0].data as Record<string, unknown>).status).toBe('cancelled');

    // Verify notifications were sent to each participant
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstCallBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(firstCallBody.user_id).toBe('user-a');
    expect(firstCallBody.type).toBe('session_cancelled');
  });
});
