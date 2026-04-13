import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

vi.mock('@/lib/payments/wompi', () => ({
  verifyWompiWebhookSignature: vi.fn(),
  mapWompiStatus: vi.fn(),
  extractWompiTransactionData: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { POST } from './route';
import { verifyWompiWebhookSignature, mapWompiStatus, extractWompiTransactionData } from '@/lib/payments/wompi';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockRequest(
  body: object,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost/api/payment/webhook/wompi', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: new Headers(headers),
  });
}

const DEFAULT_HEADERS = {
  'x-signature': 'valid-sig',
  'x-timestamp': '1700000000',
};

const DEFAULT_PAYLOAD = {
  transaction: {
    id: 'txn-001',
    reference: 'pay-001',
    amount_in_cents: 5000000,
    currency: 'COP',
    status: 'APPROVED',
  },
};

const TRANSACTION_DATA = {
  id: 'txn-001',
  reference: 'pay-001',
  amountInCents: 5000000,
  currency: 'COP',
  status: 'APPROVED',
};

// ---------------------------------------------------------------------------
// Supabase chain mock — tracks table + operation so assertions are precise
// ---------------------------------------------------------------------------

interface MockSupabaseConfig {
  existingPaymentStatus?: string | null;
  paymentRecord?: { session_id: string; participant_user_id: string } | null;
  updateError?: { message: string } | null;
  upsertError?: { message: string } | null;
}

function createMockSupabase(config: MockSupabaseConfig = {}) {
  const calls: { table: string; operation: string; args: unknown[] }[] = [];

  // Track how many times `from('payments').select(...).eq(...).single()` is
  // called so we can return different data for idempotency check vs. the
  // second select that fetches session_id/participant_user_id.
  let paymentsSelectCount = 0;

  const mockClient = {
    from: (table: string) => {
      const tableApi: Record<string, unknown> = {};

      tableApi.select = (...selectArgs: unknown[]) => {
        calls.push({ table, operation: 'select', args: selectArgs });

        const selectChain: Record<string, unknown> = {};
        selectChain.eq = (...eqArgs: unknown[]) => {
          calls.push({ table, operation: 'select.eq', args: eqArgs });

          const eqChain: Record<string, unknown> = {};
          eqChain.single = async () => {
            calls.push({ table, operation: 'select.eq.single', args: [] });

            if (table === 'payments') {
              paymentsSelectCount++;
              // First select = idempotency check
              if (paymentsSelectCount === 1) {
                return {
                  data: config.existingPaymentStatus != null
                    ? { status: config.existingPaymentStatus, wompi_transaction_id: 'txn-old' }
                    : null,
                  error: null,
                };
              }
              // Second select = fetch payment record for participant insert
              return {
                data: config.paymentRecord ?? null,
                error: null,
              };
            }
            return { data: null, error: null };
          };
          return eqChain;
        };
        return selectChain;
      };

      tableApi.update = (...updateArgs: unknown[]) => {
        calls.push({ table, operation: 'update', args: updateArgs });
        const updateChain: Record<string, unknown> = {};
        updateChain.eq = async (...eqArgs: unknown[]) => {
          calls.push({ table, operation: 'update.eq', args: eqArgs });
          return { error: config.updateError ?? null };
        };
        return updateChain;
      };

      tableApi.upsert = async (...upsertArgs: unknown[]) => {
        calls.push({ table, operation: 'upsert', args: upsertArgs });
        return { error: config.upsertError ?? null };
      };

      return tableApi;
    },
  };

  return { client: mockClient, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/payment/webhook/wompi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default env vars
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://tribe.test';
    process.env.CRON_SECRET = 'cron-secret';
    // Default happy-path stubs
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(true);
    vi.mocked(mapWompiStatus).mockReturnValue('approved');
    vi.mocked(extractWompiTransactionData).mockReturnValue(TRANSACTION_DATA as never);
    global.fetch = vi.fn().mockResolvedValue(new Response('ok'));
  });

  // 1 -----------------------------------------------------------------------
  it('returns 400 if missing x-signature or x-timestamp headers', async () => {
    const noSig = createMockRequest(DEFAULT_PAYLOAD, { 'x-timestamp': '123' });
    const res1 = await POST(noSig);
    expect(res1.status).toBe(400);

    const noTs = createMockRequest(DEFAULT_PAYLOAD, { 'x-signature': 'sig' });
    const res2 = await POST(noTs);
    expect(res2.status).toBe(400);

    const neither = createMockRequest(DEFAULT_PAYLOAD);
    const res3 = await POST(neither);
    expect(res3.status).toBe(400);
  });

  // 2 -----------------------------------------------------------------------
  it('returns 401 if signature verification fails', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockReturnValue(false);

    const req = createMockRequest(DEFAULT_PAYLOAD, DEFAULT_HEADERS);
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid signature');
  });

  // 3 -----------------------------------------------------------------------
  it('returns 200 and skips processing if payment already has same status (idempotency)', async () => {
    const { client } = createMockSupabase({ existingPaymentStatus: 'approved' });
    vi.mocked(createClient).mockReturnValue(client as never);

    const req = createMockRequest(DEFAULT_PAYLOAD, DEFAULT_HEADERS);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Already processed');
    // fetch (notification) should NOT have been called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // 4 -----------------------------------------------------------------------
  it('on approved status: updates payment, upserts participant, sends notification', async () => {
    const paymentRecord = { session_id: 'sess-42', participant_user_id: 'user-99' };
    const { client, calls } = createMockSupabase({
      existingPaymentStatus: null, // no existing payment → not idempotent
      paymentRecord,
    });
    vi.mocked(createClient).mockReturnValue(client as never);
    vi.mocked(mapWompiStatus).mockReturnValue('approved');

    const req = createMockRequest(DEFAULT_PAYLOAD, DEFAULT_HEADERS);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify payment was updated
    const updateCall = calls.find((c) => c.table === 'payments' && c.operation === 'update');
    expect(updateCall).toBeDefined();
    const updatePayload = updateCall!.args[0] as Record<string, unknown>;
    expect(updatePayload.status).toBe('approved');
    expect(updatePayload.wompi_transaction_id).toBe('txn-001');

    // Verify session_participants upsert with correct user
    const upsertCall = calls.find((c) => c.table === 'session_participants' && c.operation === 'upsert');
    expect(upsertCall).toBeDefined();
    const upsertPayload = upsertCall!.args[0] as Record<string, unknown>;
    expect(upsertPayload).toMatchObject({
      session_id: 'sess-42',
      user_id: 'user-99',
      status: 'confirmed',
    });

    // Verify notification fetch was called
    expect(global.fetch).toHaveBeenCalledOnce();
    const [fetchUrl, fetchOpts] = vi.mocked(global.fetch).mock.calls[0];
    expect(fetchUrl).toBe('https://tribe.test/api/notifications/send');
    const fetchBody = JSON.parse((fetchOpts as RequestInit).body as string);
    expect(fetchBody.user_id).toBe('user-99');
    expect(fetchBody.type).toBe('payment_confirmed');
    expect(fetchBody.data.session_id).toBe('sess-42');
  });

  // 5 -----------------------------------------------------------------------
  it('on non-approved status (declined): updates payment, does NOT add participant', async () => {
    const { client, calls } = createMockSupabase({ existingPaymentStatus: null });
    vi.mocked(createClient).mockReturnValue(client as never);
    vi.mocked(mapWompiStatus).mockReturnValue('declined');

    const req = createMockRequest(DEFAULT_PAYLOAD, DEFAULT_HEADERS);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Payment update should still happen
    const updateCall = calls.find((c) => c.table === 'payments' && c.operation === 'update');
    expect(updateCall).toBeDefined();
    const updatePayload = updateCall!.args[0] as Record<string, unknown>;
    expect(updatePayload.status).toBe('declined');

    // No participant upsert
    const upsertCall = calls.find((c) => c.table === 'session_participants' && c.operation === 'upsert');
    expect(upsertCall).toBeUndefined();

    // No notification
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // 6 -----------------------------------------------------------------------
  it('returns 200 even on internal errors to prevent Wompi retry loops', async () => {
    vi.mocked(verifyWompiWebhookSignature).mockImplementation(() => {
      throw new Error('Unexpected crash');
    });

    const req = createMockRequest(DEFAULT_PAYLOAD, DEFAULT_HEADERS);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
