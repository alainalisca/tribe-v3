/**
 * Tests for refundAttendance (lib/dal/clients.ts).
 *
 * Covers every discriminated error code + the happy path. Tests are
 * structured as "given this DB state, calling refundAttendance with
 * these inputs returns this outcome." Each test builds a focused
 * mock Supabase client rather than sharing a generic stub so the
 * failure modes are obvious in the assertion text.
 *
 * Why these tests matter: refundAttendance touches money + has six
 * distinct error paths. A regression that returns success for a
 * not_paid input would create accounting drift; one that lets a
 * refund exceed amount_paid_cents would violate the migration 083
 * CHECK constraint at runtime and surface as 500s in production.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { refundAttendance } from './clients';

// Suppress the DAL's logError calls so test output isn't noisy.
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface MockRow {
  id: string;
  client_id: string;
  session_id: string;
  paid: boolean;
  amount_paid_cents: number | null;
  currency: string | null;
  refunded_amount_cents: number | null;
  client: { gym_id: string | null } | null;
}

/**
 * Build a Supabase client mock pinned to a single call sequence:
 * one .select().eq().maybeSingle() (the row lookup) followed by
 * one .update().eq() (the actual refund write). Either call can
 * be overridden to return data or an error.
 */
function buildSupabaseMock(opts: {
  lookupRow?: MockRow | null;
  lookupError?: { message: string } | null;
  updateError?: { message: string } | null;
}): SupabaseClient {
  const lookupChain = {
    select: () => lookupChain,
    eq: () => lookupChain,
    maybeSingle: async () => ({
      data: opts.lookupRow ?? null,
      error: opts.lookupError ?? null,
    }),
  };
  const updateChain = {
    update: () => updateChain,
    eq: async () => ({ error: opts.updateError ?? null }),
  };

  // The DAL calls .from('client_attendance') twice: once for lookup
  // (with .select()), once for update (with .update()). We discriminate
  // by which method gets called first.
  return {
    from: () => ({
      select: lookupChain.select,
      update: updateChain.update,
    }),
  } as unknown as SupabaseClient;
}

const VALID_INPUT = {
  refundedAmountCents: 1000, // $10.00
  refundReason: 'Member rescheduled, no charge agreed',
};

const PAID_ROW: MockRow = {
  id: 'att-1',
  client_id: 'client-1',
  session_id: 'session-1',
  paid: true,
  amount_paid_cents: 2000, // $20.00 — refund of 1000 is half
  currency: 'USD',
  refunded_amount_cents: null,
  client: { gym_id: 'gym-1' },
};

describe('refundAttendance — input validation (rejects before DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty refund reason as reason_invalid', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: 1000,
      refundReason: '   ', // whitespace-only
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('reason_invalid');
  });

  it('rejects a refund reason longer than 500 chars', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: 1000,
      refundReason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('reason_invalid');
  });

  it('rejects zero refund amount as amount_invalid', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: 0,
      refundReason: 'Test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('amount_invalid');
  });

  it('rejects negative refund amount as amount_invalid', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: -100,
      refundReason: 'Test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('amount_invalid');
  });

  it('rejects NaN refund amount as amount_invalid', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: Number.NaN,
      refundReason: 'Test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('amount_invalid');
  });
});

describe('refundAttendance — DB state checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not_found when the row does not exist', async () => {
    const supabase = buildSupabaseMock({ lookupRow: null });
    const result = await refundAttendance(supabase, 'att-missing', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_found');
  });

  it('returns db_error when the lookup query itself fails', async () => {
    const supabase = buildSupabaseMock({
      lookupError: { message: 'connection refused' },
    });
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
  });

  it('returns not_paid when paid=false', async () => {
    const supabase = buildSupabaseMock({
      lookupRow: { ...PAID_ROW, paid: false },
    });
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_paid');
  });

  it('returns not_paid when amount_paid_cents is null', async () => {
    const supabase = buildSupabaseMock({
      lookupRow: { ...PAID_ROW, amount_paid_cents: null },
    });
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_paid');
  });

  it('returns not_paid when amount_paid_cents is 0', async () => {
    const supabase = buildSupabaseMock({
      lookupRow: { ...PAID_ROW, amount_paid_cents: 0 },
    });
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_paid');
  });

  it('returns already_refunded when refunded_amount_cents is already set', async () => {
    const supabase = buildSupabaseMock({
      lookupRow: { ...PAID_ROW, refunded_amount_cents: 500 },
    });
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('already_refunded');
  });

  it('returns amount_invalid when refund > amount_paid_cents (over-refund guard)', async () => {
    const supabase = buildSupabaseMock({
      lookupRow: { ...PAID_ROW, amount_paid_cents: 1000 },
    });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: 1500, // tries to refund $15 against $10 paid
      refundReason: 'Test',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('amount_invalid');
  });
});

describe('refundAttendance — success path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a snapshot with all money-relevant fields on success', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    const snap = result.data!;
    expect(snap.id).toBe('att-1');
    expect(snap.client_id).toBe('client-1');
    expect(snap.session_id).toBe('session-1');
    expect(snap.amount_paid_cents).toBe(2000);
    expect(snap.refunded_amount_cents).toBe(1000);
    expect(snap.currency).toBe('USD');
    expect(snap.refund_reason).toBe('Member rescheduled, no charge agreed');
    expect(snap.gym_id).toBe('gym-1');
    expect(typeof snap.refunded_at).toBe('string');
    // refunded_at should be an ISO timestamp from "now" (rough sanity check)
    expect(new Date(snap.refunded_at).getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('full refund (refund === amount_paid) is allowed', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: 2000, // matches amount_paid_cents exactly
      refundReason: 'Member quit the gym',
    });
    expect(result.success).toBe(true);
    expect(result.data?.refunded_amount_cents).toBe(2000);
  });

  it('trims whitespace from the reason before storing', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: 1000,
      refundReason: '   Scheduling mix-up   ',
    });
    expect(result.success).toBe(true);
    expect(result.data?.refund_reason).toBe('Scheduling mix-up');
  });

  it('rounds fractional refund amounts to integer cents', async () => {
    const supabase = buildSupabaseMock({ lookupRow: PAID_ROW });
    const result = await refundAttendance(supabase, 'att-1', {
      refundedAmountCents: 999.6, // floating-point artifact
      refundReason: 'Partial refund',
    });
    expect(result.success).toBe(true);
    expect(result.data?.refunded_amount_cents).toBe(1000);
  });

  it('propagates db_error when the update phase fails', async () => {
    const supabase = buildSupabaseMock({
      lookupRow: PAID_ROW,
      updateError: { message: 'CHECK constraint violation' },
    });
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
  });
});

describe('refundAttendance — exception handling', () => {
  it('returns db_error when the supabase call throws unexpectedly', async () => {
    const supabase = {
      from: () => {
        throw new Error('network blew up');
      },
    } as unknown as SupabaseClient;
    const result = await refundAttendance(supabase, 'att-1', VALID_INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toBe('db_error');
  });
});
