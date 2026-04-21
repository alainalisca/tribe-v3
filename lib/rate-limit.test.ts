import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

import { checkRateLimit } from './rate-limit';

/**
 * The in-memory `rateLimit()` helper was removed in 2026-04-21 (AUDIT-P0-1).
 * Its unit tests lived here; they no longer apply because the only public
 * export is the Supabase-backed `checkRateLimit`, which integrates with a
 * real rate_limits table.
 *
 * These tests exercise `checkRateLimit` against a minimal Supabase mock
 * that tracks inserted rows in an array and resolves counts from that
 * array. It's not a perfect fidelity test (no real sliding window
 * semantics, no index-awareness), but it's enough to catch regressions in
 * the allow/deny decision logic and the fail-open behavior on DB errors.
 */

interface MockRow {
  key: string;
  created_at: string;
}

function createMockSupabase(
  options: {
    failCount?: boolean;
    failInsert?: boolean;
  } = {}
) {
  const rows: MockRow[] = [];

  function from(_table: string) {
    return {
      select(_cols: string, _opts?: unknown) {
        return {
          eq(_field: string, keyVal: string) {
            return {
              gte(_field2: string, windowStart: string) {
                if (options.failCount) {
                  return Promise.resolve({ count: null, error: new Error('db down') });
                }
                const count = rows.filter((r) => r.key === keyVal && r.created_at >= windowStart).length;
                return Promise.resolve({ count, error: null });
              },
            };
          },
        };
      },
      insert(row: { key: string }) {
        if (options.failInsert) {
          return Promise.resolve({ error: new Error('insert failed') });
        }
        rows.push({ key: row.key, created_at: new Date().toISOString() });
        return Promise.resolve({ error: null });
      },
      delete() {
        return {
          eq() {
            return {
              lt() {
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    };
  }

  return { from, __rows: rows };
}

describe('checkRateLimit', () => {
  it('allows a request when no prior hits exist', async () => {
    const supabase = createMockSupabase();
    const res = await checkRateLimit(supabase as never, 'test:ip1', 5, 60_000);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(4);
  });

  it('decrements remaining as hits accrue under the limit', async () => {
    const supabase = createMockSupabase();
    const a = await checkRateLimit(supabase as never, 'test:ip2', 3, 60_000);
    const b = await checkRateLimit(supabase as never, 'test:ip2', 3, 60_000);
    const c = await checkRateLimit(supabase as never, 'test:ip2', 3, 60_000);
    expect(a.remaining).toBe(2);
    expect(b.remaining).toBe(1);
    expect(c.remaining).toBe(0);
    expect(c.allowed).toBe(true);
  });

  it('blocks when the count meets the maximum', async () => {
    const supabase = createMockSupabase();
    // First 2 calls put us at count=2 (limit)
    await checkRateLimit(supabase as never, 'test:ip3', 2, 60_000);
    await checkRateLimit(supabase as never, 'test:ip3', 2, 60_000);
    const over = await checkRateLimit(supabase as never, 'test:ip3', 2, 60_000);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it('partitions independently by key', async () => {
    const supabase = createMockSupabase();
    await checkRateLimit(supabase as never, 'test:ipA', 1, 60_000);
    const aBlocked = await checkRateLimit(supabase as never, 'test:ipA', 1, 60_000);
    const bAllowed = await checkRateLimit(supabase as never, 'test:ipB', 1, 60_000);
    expect(aBlocked.allowed).toBe(false);
    expect(bAllowed.allowed).toBe(true);
  });

  it('fails OPEN when the count query errors (DB outage)', async () => {
    const supabase = createMockSupabase({ failCount: true });
    const res = await checkRateLimit(supabase as never, 'test:ipC', 1, 60_000);
    expect(res.allowed).toBe(true);
  });

  it('still allows when the insert errors but the count was under limit', async () => {
    const supabase = createMockSupabase({ failInsert: true });
    const res = await checkRateLimit(supabase as never, 'test:ipD', 5, 60_000);
    expect(res.allowed).toBe(true);
  });
});
