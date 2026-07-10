import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUsersForEmailJobs } from './users';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

/**
 * Builds a chainable Supabase query stub. `pages` is the sequence of results
 * returned by successive `.range()` calls, letting us drive the pagination loop.
 */
function makeSupabase(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  const calls: { ranges: Array<[number, number]>; filters: string[] } = { ranges: [], filters: [] };
  let call = 0;

  const builder = {
    select: () => builder,
    is: (col: string, val: unknown) => {
      calls.filters.push(`is:${col}:${String(val)}`);
      return builder;
    },
    not: (col: string, op: string, val: unknown) => {
      calls.filters.push(`not:${col}:${op}:${String(val)}`);
      return builder;
    },
    order: () => builder,
    range: (from: number, to: number) => {
      calls.ranges.push([from, to]);
      return Promise.resolve(pages[call++] ?? { data: [], error: null });
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub stands in for SupabaseClient
  const supabase = { from: () => builder } as any;
  return { supabase, calls };
}

const user = (id: string) => ({ id, email: `${id}@x.com`, name: id, preferred_language: 'en', created_at: '2026-01-01' });

describe('fetchUsersForEmailJobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('propagates a query failure instead of returning an empty list', async () => {
    // This is the regression: a 42501 on a revoked column used to surface as
    // `data || []` -> "No users found", silently disabling the email jobs.
    const { supabase } = makeSupabase([{ data: null, error: { message: 'permission denied for column is_admin' } }]);

    const result = await fetchUsersForEmailJobs(supabase);

    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
    expect(result.data).toBeUndefined();
  });

  it('excludes soft-deleted, banned, and test accounts', async () => {
    const { supabase, calls } = makeSupabase([{ data: [user('a')], error: null }]);

    await fetchUsersForEmailJobs(supabase);

    expect(calls.filters).toContain('is:deleted_at:null');
    // `not ... is true` (not `eq false`) so a NULL never drops a real recipient
    expect(calls.filters).toContain('not:banned:is:true');
    expect(calls.filters).toContain('not:is_test_account:is:true');
  });

  it('returns a successful empty list when there are genuinely no eligible users', async () => {
    const { supabase } = makeSupabase([{ data: [], error: null }]);

    const result = await fetchUsersForEmailJobs(supabase);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('paginates past a single page rather than silently capping', async () => {
    const full = Array.from({ length: 500 }, (_, i) => user(`u${i}`));
    const { supabase, calls } = makeSupabase([
      { data: full, error: null },
      { data: [user('last')], error: null },
    ]);

    const result = await fetchUsersForEmailJobs(supabase);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(501);
    expect(calls.ranges).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });

  it('stops paginating on a short page', async () => {
    const { supabase, calls } = makeSupabase([{ data: [user('a'), user('b')], error: null }]);

    const result = await fetchUsersForEmailJobs(supabase);

    expect(result.data).toHaveLength(2);
    expect(calls.ranges).toHaveLength(1);
  });
});
