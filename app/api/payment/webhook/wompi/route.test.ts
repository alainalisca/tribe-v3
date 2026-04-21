import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Rewritten fixtures for the post-LOGIC-04 Wompi webhook.
 *
 * Unlike Stripe, the Wompi handler performs an amount-tamper pre-check
 * against the existing `payments` row BEFORE invoking the RPC. That's a
 * belt-and-suspenders thing: finalize_payment also does the check
 * internally, but pre-checking lets us fail fast with a 400 rather than
 * making the RPC run.
 *
 * Coverage:
 *   1. Missing signature/timestamp → 400
 *   2. Signature fails verification → 401
 *   3. Duplicate transaction_id (event-id dedup) → 200 duplicate:true
 *   4. Amount tamper vs existing payment → 400, no RPC call
 *   5. Same-status already-processed → 200, no RPC call
 *   6. Happy path: approved status, calls finalize_payment with expected
 *      args and schedules notification
 *   7. RPC error → 500 so gateway retries
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

vi.mock('@/lib/payments/wompi', () => ({
  verifyWompiWebhookSignature: vi.fn(),
  mapWompiStatus: vi.fn(),
  extractWompiTransactionData: vi.fn(),
}));

vi.mock('@/lib/payments/notifyAfterFinalize', () => ({
  notifyAfterFinalize: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { POST } from './route';
import { verifyWompiWebhookSignature, mapWompiStatus, extractWompiTransactionData } from '@/lib/payments/wompi';
import { notifyAfterFinalize } from '@/lib/payments/notifyAfterFinalize';
import { createClient } from '@supabase/supabase-js';

// ── Supabase mock ──────────────────────────────────────────────────

function mockSupabase(opts: {
  isDuplicate?: boolean;
  existingPayment?: { status: string; amount_cents: number | null; gateway_payment_id?: string } | null;
  rpcResult?: {
    data?: Record<string, unknown>;
    error?: { message: string } | null;
  };
}) {
  const insertFn = vi.fn().mockResolvedValue({
    error: opts.isDuplicate ? { code: '23505', message: 'duplicate' } : null,
  });
  const rpcFn = vi.fn().mockResolvedValue({
    data: opts.rpcResult?.data ?? { success: true, was_duplicate: false, payment_id: 'pay-wompi' },
    error: opts.rpcResult?.error ?? null,
  });

  const paymentsChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: opts.existingPayment ?? null, error: null }),
      }),
    }),
  };
  const eventsChain = { insert: insertFn };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'processed_webhook_events') return eventsChain;
      if (table === 'payments') return paymentsChain;
      return { insert: vi.fn(), select: vi.fn() };
    }),
    rpc: rpcFn,
    __rpcFn: rpcFn,
    __insertFn: insertFn,
  };
  return supabase;
}

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/payment/webhook/wompi', {
    method: 'POST',
    body,
    headers: new Headers(headers),
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POST /api/payment/webhook/wompi', () => {
  beforeEach(() => {
    // clearAllMocks preserves vi.mock default implementations (the
    // notifyAfterFinalize resolved promise); resetAllMocks would wipe them.
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  it('returns 400 when x-signature or x-timestamp is missing', async () => {
    const res = await POST(request('{}'));
    expect(res.status).toBe(400);
  });

  it('returns 401 when signature verification fails', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(false);
    const res = await POST(request('{}', { 'x-signature': 'bad', 'x-timestamp': '1' }));
    expect(res.status).toBe(401);
  });

  it('short-circuits on duplicate transaction id', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(true);
    vi.mocked(extractWompiTransactionData).mockReturnValue({ currency: 'COP', amount_in_cents: 10000 } as never);
    vi.mocked(mapWompiStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({ isDuplicate: true });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const body = JSON.stringify({
      transaction: {
        id: 'txn_dup',
        reference: 'pay-X',
        amount_in_cents: 10000,
        currency: 'COP',
        status: 'APPROVED',
      },
    });
    const res = await POST(request(body, { 'x-signature': 'ok', 'x-timestamp': '1' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.duplicate).toBe(true);
    expect(supabase.__rpcFn).not.toHaveBeenCalled();
  });

  it('rejects amount-tamper before calling RPC', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(true);
    vi.mocked(extractWompiTransactionData).mockReturnValue({ currency: 'COP', amount_in_cents: 999 } as never);
    vi.mocked(mapWompiStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      existingPayment: { status: 'pending', amount_cents: 1000 },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const body = JSON.stringify({
      transaction: {
        id: 'txn_tamper',
        reference: 'pay-X',
        amount_in_cents: 999,
        currency: 'COP',
        status: 'APPROVED',
      },
    });
    const res = await POST(request(body, { 'x-signature': 'ok', 'x-timestamp': '1' }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('amount_mismatch');
    expect(supabase.__rpcFn).not.toHaveBeenCalled();
    expect(notifyAfterFinalize).not.toHaveBeenCalled();
  });

  it('skips processing when status already matches (idempotency)', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(true);
    vi.mocked(extractWompiTransactionData).mockReturnValue({ currency: 'COP', amount_in_cents: 1000 } as never);
    vi.mocked(mapWompiStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      existingPayment: { status: 'approved', amount_cents: 1000 },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const body = JSON.stringify({
      transaction: {
        id: 'txn_same',
        reference: 'pay-X',
        amount_in_cents: 1000,
        currency: 'COP',
        status: 'APPROVED',
      },
    });
    const res = await POST(request(body, { 'x-signature': 'ok', 'x-timestamp': '1' }));
    expect(res.status).toBe(200);
    expect(supabase.__rpcFn).not.toHaveBeenCalled();
  });

  it('happy path: calls finalize_payment and notifies on first approval', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(true);
    vi.mocked(extractWompiTransactionData).mockReturnValue({ currency: 'COP', amount_in_cents: 1000 } as never);
    vi.mocked(mapWompiStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      existingPayment: { status: 'pending', amount_cents: 1000 },
      rpcResult: { data: { success: true, was_duplicate: false, payment_id: 'pay-happy' } },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const body = JSON.stringify({
      transaction: {
        id: 'txn_happy',
        reference: 'pay-happy',
        amount_in_cents: 1000,
        currency: 'COP',
        status: 'APPROVED',
      },
    });
    const res = await POST(request(body, { 'x-signature': 'ok', 'x-timestamp': '1' }));
    expect(res.status).toBe(200);

    expect(supabase.__rpcFn).toHaveBeenCalledWith('finalize_payment', {
      p_gateway_payment_id: 'txn_happy',
      p_expected_amount_cents: 1000,
      p_gateway: 'wompi',
      p_new_status: 'approved',
    });
    expect(notifyAfterFinalize).toHaveBeenCalledWith(supabase, 'pay-happy');
  });

  it('returns 500 on RPC error so Wompi retries', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(true);
    vi.mocked(extractWompiTransactionData).mockReturnValue({ currency: 'COP', amount_in_cents: 1000 } as never);
    vi.mocked(mapWompiStatus).mockReturnValue('approved' as never);

    const supabase = mockSupabase({
      existingPayment: { status: 'pending', amount_cents: 1000 },
      rpcResult: { error: { message: 'db down' } },
    });
    vi.mocked(createClient).mockReturnValue(supabase as never);

    const body = JSON.stringify({
      transaction: {
        id: 'txn_err',
        reference: 'pay-X',
        amount_in_cents: 1000,
        currency: 'COP',
        status: 'APPROVED',
      },
    });
    const res = await POST(request(body, { 'x-signature': 'ok', 'x-timestamp': '1' }));
    expect(res.status).toBe(500);
  });
});
