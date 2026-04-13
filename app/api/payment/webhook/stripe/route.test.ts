import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

vi.mock('@/lib/payments/stripe', () => ({
  verifyStripeWebhookSignature: vi.fn(),
  mapStripeStatus: vi.fn(),
  getStripePaymentIntent: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { POST } from './route';
import {
  verifyStripeWebhookSignature,
  mapStripeStatus,
  getStripePaymentIntent,
} from '@/lib/payments/stripe';
import { createClient } from '@supabase/supabase-js';

// ── Helpers ────────────────────────────────────────────────────────

function createMockRequest(
  body: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/payment/webhook/stripe', {
    method: 'POST',
    body,
    headers: new Headers(headers),
  });
}

/** Tracks every chained call per table so tests can assert on queries. */
function createSupabaseMock(overrides: {
  selectData?: Record<string, unknown> | null;
  selectError?: unknown;
  upsertError?: unknown;
}) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];

  function track(table: string, op: string, ...args: unknown[]) {
    calls.push({ table, op, args });
  }

  const chainable = (table: string) => {
    const chain: Record<string, unknown> = {};

    // .select().eq().single()
    chain.select = (...a: unknown[]) => {
      track(table, 'select', ...a);
      return chain;
    };
    chain.eq = (...a: unknown[]) => {
      track(table, 'eq', ...a);
      return chain;
    };
    chain.single = () => {
      track(table, 'single');
      return Promise.resolve({
        data: overrides.selectData ?? null,
        error: null,
      });
    };

    // .update().eq()
    chain.update = (...a: unknown[]) => {
      track(table, 'update', ...a);
      return chain;
    };

    // .upsert()
    chain.upsert = (...a: unknown[]) => {
      track(table, 'upsert', ...a);
      return Promise.resolve({
        data: null,
        error: overrides.upsertError ?? null,
      });
    };

    return chain;
  };

  const supabase = { from: (table: string) => chainable(table) };

  return { supabase, calls };
}

// ── Test suite ─────────────────────────────────────────────────────

describe('POST /api/payment/webhook/stripe', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    process.env.CRON_SECRET = 'cron-secret';
  });

  // ── 1. Missing signature ────────────────────────────────────────

  it('returns 400 if stripe-signature header is missing', async () => {
    const req = createMockRequest('{}');
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing stripe-signature/i);
  });

  // ── 2. Invalid signature ────────────────────────────────────────

  it('returns 401 if signature verification fails', async () => {
    vi.mocked(verifyStripeWebhookSignature).mockReturnValue(null);

    const req = createMockRequest('{}', { 'stripe-signature': 'bad_sig' });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid signature/i);
  });

  // ── 3. checkout.session.completed ───────────────────────────────

  it('checkout.session.completed: updates payment and adds participant when approved', async () => {
    const sessionId = 'cs_test_123';
    const paymentIntentId = 'pi_test_456';

    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: { id: sessionId, payment_intent: paymentIntentId },
      },
    } as never);

    vi.mocked(getStripePaymentIntent).mockResolvedValue({
      status: 'succeeded',
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved');

    // First .single() -> idempotency check (no existing record)
    // Second .single() -> addParticipantAfterPayment lookup
    let singleCallCount = 0;
    const { supabase, calls } = createSupabaseMock({});

    // Override .single to return different data per call
    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table: string) => {
      const chain = originalFrom(table);
      const origSingle = chain.single as () => Promise<unknown>;
      chain.single = () => {
        singleCallCount++;
        if (singleCallCount === 1) {
          // Idempotency check: no existing record with this status
          return Promise.resolve({ data: null, error: null });
        }
        // addParticipantAfterPayment: return a payment record
        return Promise.resolve({
          data: {
            id: 'pay_1',
            session_id: 'sess_abc',
            participant_user_id: 'user_xyz',
            status: 'approved',
          },
          error: null,
        });
      };
      return chain;
    };

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const req = createMockRequest('{}', { 'stripe-signature': 'valid_sig' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify getStripePaymentIntent was called with the PI id
    expect(getStripePaymentIntent).toHaveBeenCalledWith(paymentIntentId);
    expect(mapStripeStatus).toHaveBeenCalledWith('succeeded');

    // Verify notification was sent
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/notifications/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ── 4. payment_intent.succeeded ─────────────────────────────────

  it('payment_intent.succeeded: updates status and adds participant', async () => {
    const piId = 'pi_success_789';

    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: piId, status: 'succeeded' } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved');

    let singleCallCount = 0;
    const { supabase } = createSupabaseMock({});

    const originalFrom = supabase.from.bind(supabase);
    supabase.from = (table: string) => {
      const chain = originalFrom(table);
      chain.single = () => {
        singleCallCount++;
        if (singleCallCount === 1) {
          // Idempotency: not yet processed
          return Promise.resolve({ data: null, error: null });
        }
        // addParticipantAfterPayment lookup
        return Promise.resolve({
          data: {
            id: 'pay_2',
            session_id: 'sess_def',
            participant_user_id: 'user_456',
            status: 'approved',
          },
          error: null,
        });
      };
      return chain;
    };

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const req = createMockRequest('{}', { 'stripe-signature': 'valid_sig' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mapStripeStatus).toHaveBeenCalledWith('succeeded');

    // Notification sent for the participant
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/notifications/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ── 5. payment_intent.payment_failed ────────────────────────────

  it('payment_intent.payment_failed: updates status to failed, does NOT add participant', async () => {
    const piId = 'pi_failed_000';

    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: piId,
          status: 'requires_payment_method',
          last_payment_error: { message: 'Card declined' },
        },
      },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('failed' as never);

    const { supabase, calls } = createSupabaseMock({});
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const req = createMockRequest('{}', { 'stripe-signature': 'valid_sig' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mapStripeStatus).toHaveBeenCalledWith('requires_payment_method');

    // Should have called update on payments but NOT upsert on session_participants
    const updateCalls = calls.filter((c) => c.op === 'update');
    const upsertCalls = calls.filter((c) => c.op === 'upsert');
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(upsertCalls.length).toBe(0);

    // No notification sent
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── 6. Idempotency: already processed ───────────────────────────

  it('returns early without updating if payment is already processed (idempotency)', async () => {
    const piId = 'pi_idempotent_111';

    vi.mocked(verifyStripeWebhookSignature).mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: piId, status: 'succeeded' } },
    } as never);
    vi.mocked(mapStripeStatus).mockReturnValue('approved');

    // Idempotency check returns matching status -> already processed
    const { supabase, calls } = createSupabaseMock({
      selectData: { status: 'approved' },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const req = createMockRequest('{}', { 'stripe-signature': 'valid_sig' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Already processed');

    // No update or upsert should have happened
    const updateCalls = calls.filter((c) => c.op === 'update');
    const upsertCalls = calls.filter((c) => c.op === 'upsert');
    expect(updateCalls.length).toBe(0);
    expect(upsertCalls.length).toBe(0);

    // No notification sent
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
