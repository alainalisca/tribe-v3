/**
 * Tests for listUnpaidAttendance (lib/dal/clients.ts).
 *
 * Covers:
 *   - The group-by-client logic (multiple unpaid rows per client
 *     collapse into one entry with the right count + date bounds)
 *   - The archived-client exclusion
 *   - The suggested-price computation: median per currency, with
 *     the MIN_PRICING_SAMPLE_SIZE guard preventing noise
 *   - The lower-middle median behavior (returns a real session
 *     price, not an interpolation)
 *   - Empty-result safety
 *
 * The function does TWO queries in Promise.all: unpaid rows + paid
 * rows (for pricing). The mock exposes both lanes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listUnpaidAttendance } from './clients';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

interface UnpaidRow {
  attended_at: string | null;
  attended: boolean;
  paid: boolean;
  client_id: string;
  client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    archived: boolean;
  } | null;
}

interface PaidRow {
  amount_paid_cents: number | null;
  currency: 'USD' | 'COP' | null;
}

interface MockShape {
  unpaidRows?: UnpaidRow[];
  unpaidError?: { message: string } | null;
  pricingRows?: PaidRow[];
  pricingError?: { message: string } | null;
}

/**
 * The DAL's Promise.all hits two different .from('client_attendance')
 * chains in parallel. We discriminate by which filter chain is invoked:
 *   - unpaid: .eq('attended', true).eq('paid', false).gte(...).order(...)
 *   - pricing: .eq('paid', true).gte(...).not(...).not(...)
 *
 * We track .paid(...) value to route. Simpler than introspecting
 * the full chain — the first .eq() that names "paid" tells us.
 */
function buildSupabaseMock(shape: MockShape): SupabaseClient {
  function buildChain(values: { rows: unknown[]; error: { message: string } | null }) {
    const chain: Record<string, unknown> = {};
    const fn = () => chain;
    chain.eq = fn;
    chain.gte = fn;
    chain.lt = fn;
    chain.not = fn;
    chain.order = fn;
    // The query is "awaited" — Supabase chains terminate on await
    // by being thenable. Implement .then so `await query` resolves.
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: values.rows, error: values.error });
    return chain;
  }

  return {
    from: (table: string) => {
      if (table !== 'client_attendance') throw new Error(`unexpected table: ${table}`);
      return {
        // We need to discriminate the two select() calls. The DAL
        // calls .select() with different column strings: the unpaid
        // path includes 'client:clients(...)', the pricing path
        // selects only 'amount_paid_cents, currency'. We split on
        // that substring.
        select: (columns: string) => {
          const isPricingQuery = columns.includes('amount_paid_cents') && !columns.includes('client:');
          if (isPricingQuery) {
            return buildChain({
              rows: shape.pricingRows ?? [],
              error: shape.pricingError ?? null,
            });
          }
          return buildChain({
            rows: shape.unpaidRows ?? [],
            error: shape.unpaidError ?? null,
          });
        },
      };
    },
  } as unknown as SupabaseClient;
}

function unpaidRow(opts: {
  clientId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  attendedAt: string;
  archived?: boolean;
}): UnpaidRow {
  return {
    attended_at: opts.attendedAt,
    attended: true,
    paid: false,
    client_id: opts.clientId,
    client: {
      id: opts.clientId,
      name: opts.name,
      email: opts.email ?? null,
      phone: opts.phone ?? null,
      archived: opts.archived ?? false,
    },
  };
}

describe('listUnpaidAttendance — grouping behavior', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty when there are no unpaid rows', async () => {
    const supabase = buildSupabaseMock({ unpaidRows: [], pricingRows: [] });
    const result = await listUnpaidAttendance(supabase);
    expect(result.success).toBe(true);
    expect(result.data?.groups).toEqual([]);
  });

  it('groups multiple unpaid rows for the same client into one entry', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [
        unpaidRow({ clientId: 'c1', name: 'Carlos', attendedAt: '2026-04-28T10:00:00Z' }),
        unpaidRow({ clientId: 'c1', name: 'Carlos', attendedAt: '2026-04-20T10:00:00Z' }),
        unpaidRow({ clientId: 'c1', name: 'Carlos', attendedAt: '2026-04-15T10:00:00Z' }),
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.success).toBe(true);
    expect(result.data?.groups).toHaveLength(1);
    const group = result.data!.groups[0];
    expect(group.client_id).toBe('c1');
    expect(group.unpaid_count).toBe(3);
    expect(group.oldest_unpaid_at).toBe('2026-04-15T10:00:00Z');
    expect(group.newest_unpaid_at).toBe('2026-04-28T10:00:00Z');
  });

  it('sorts groups by newest_unpaid_at DESC (fresh debt first)', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [
        unpaidRow({ clientId: 'old', name: 'Older Debt', attendedAt: '2026-03-10T10:00:00Z' }),
        unpaidRow({ clientId: 'new', name: 'New Debt', attendedAt: '2026-05-01T10:00:00Z' }),
        unpaidRow({ clientId: 'mid', name: 'Mid Debt', attendedAt: '2026-04-15T10:00:00Z' }),
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.success).toBe(true);
    expect(result.data?.groups.map((g) => g.client_id)).toEqual(['new', 'mid', 'old']);
  });

  it('excludes archived clients from the results', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [
        unpaidRow({ clientId: 'c1', name: 'Active', attendedAt: '2026-04-28T10:00:00Z' }),
        unpaidRow({ clientId: 'c2', name: 'Archived', attendedAt: '2026-04-28T10:00:00Z', archived: true }),
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.success).toBe(true);
    expect(result.data?.groups).toHaveLength(1);
    expect(result.data?.groups[0].client_id).toBe('c1');
  });

  it('skips rows with null attended_at', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [
        // The DAL filters .gte('attended_at', cutoff) at the DB level
        // but we test defensive client-side guard too.
        { ...unpaidRow({ clientId: 'c1', name: 'A', attendedAt: '2026-04-20T10:00:00Z' }), attended_at: null },
        unpaidRow({ clientId: 'c2', name: 'B', attendedAt: '2026-04-25T10:00:00Z' }),
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.success).toBe(true);
    expect(result.data?.groups.map((g) => g.client_id)).toEqual(['c2']);
  });

  it('propagates the client name + contact info through grouping', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [
        unpaidRow({
          clientId: 'c1',
          name: 'Carlos González',
          phone: '+573001234567',
          email: 'carlos@example.com',
          attendedAt: '2026-04-28T10:00:00Z',
        }),
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.data?.groups[0].client_name).toBe('Carlos González');
    expect(result.data?.groups[0].client_phone).toBe('+573001234567');
    expect(result.data?.groups[0].client_email).toBe('carlos@example.com');
  });
});

describe('listUnpaidAttendance — suggested pricing (median computation)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty suggestions when fewer than 3 paid rows in a currency', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [],
      pricingRows: [
        { amount_paid_cents: 2000, currency: 'USD' },
        { amount_paid_cents: 3000, currency: 'USD' },
      ], // only 2 → below MIN_PRICING_SAMPLE_SIZE
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.data?.suggested_amount_cents).toEqual({});
  });

  it('returns a USD suggestion at 3+ rows', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [],
      pricingRows: [
        { amount_paid_cents: 1000, currency: 'USD' },
        { amount_paid_cents: 2000, currency: 'USD' },
        { amount_paid_cents: 3000, currency: 'USD' },
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    // lower-middle of [1000, 2000, 3000] → index 1 → 2000
    expect(result.data?.suggested_amount_cents.USD).toBe(2000);
  });

  it('uses the LOWER-middle for even-length sorted arrays (returns a real session value)', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [],
      pricingRows: [
        { amount_paid_cents: 1000, currency: 'USD' },
        { amount_paid_cents: 2000, currency: 'USD' },
        { amount_paid_cents: 3000, currency: 'USD' },
        { amount_paid_cents: 4000, currency: 'USD' },
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    // floor((4-1)/2) = 1 → sorted[1] = 2000 (not the averaged 2500)
    expect(result.data?.suggested_amount_cents.USD).toBe(2000);
  });

  it('computes USD and COP medians independently', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [],
      pricingRows: [
        // USD: 3 rows, median = 2000
        { amount_paid_cents: 1500, currency: 'USD' },
        { amount_paid_cents: 2000, currency: 'USD' },
        { amount_paid_cents: 2500, currency: 'USD' },
        // COP: 3 rows, median = 50000
        { amount_paid_cents: 40000, currency: 'COP' },
        { amount_paid_cents: 50000, currency: 'COP' },
        { amount_paid_cents: 60000, currency: 'COP' },
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.data?.suggested_amount_cents.USD).toBe(2000);
    expect(result.data?.suggested_amount_cents.COP).toBe(50000);
  });

  it('skips paid rows with null amount or null currency', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [],
      pricingRows: [
        { amount_paid_cents: 1000, currency: 'USD' },
        { amount_paid_cents: null, currency: 'USD' }, // skipped
        { amount_paid_cents: 2000, currency: null }, // skipped
        { amount_paid_cents: 3000, currency: 'USD' },
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    // only 2 valid USD rows → below sample-size floor
    expect(result.data?.suggested_amount_cents.USD).toBeUndefined();
  });

  it('skips zero-cent paid rows from the median', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [],
      pricingRows: [
        { amount_paid_cents: 0, currency: 'USD' }, // skipped
        { amount_paid_cents: 1000, currency: 'USD' },
        { amount_paid_cents: 2000, currency: 'USD' },
        { amount_paid_cents: 3000, currency: 'USD' },
      ],
    });
    const result = await listUnpaidAttendance(supabase);
    // [1000, 2000, 3000] → lower-middle = 2000
    expect(result.data?.suggested_amount_cents.USD).toBe(2000);
  });

  it('returns empty suggestions when pricing query fails (graceful degradation)', async () => {
    const supabase = buildSupabaseMock({
      unpaidRows: [],
      pricingError: { message: 'pricing query failed' },
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.success).toBe(true); // doesn't fail the whole request
    expect(result.data?.suggested_amount_cents).toEqual({});
  });
});

describe('listUnpaidAttendance — error paths', () => {
  it('returns failure when the unpaid query itself fails', async () => {
    const supabase = buildSupabaseMock({
      unpaidError: { message: 'connection refused' },
    });
    const result = await listUnpaidAttendance(supabase);
    expect(result.success).toBe(false);
  });
});
