import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchMyLatestPaymentInstructions } from './sessions';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

interface MockOptions {
  user?: { id: string } | null;
  rows?: { payment_instructions: string | null }[];
  error?: { message: string } | null;
}

/** Records every filter call so the test can assert the query is scoped to the caller. */
function createMockSupabase(opts: MockOptions) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'not', 'neq', 'order']) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.limit = async (...args: unknown[]) => {
    calls.push({ method: 'limit', args });
    return { data: opts.rows ?? [], error: opts.error ?? null };
  };
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: opts.user === undefined ? { id: 'host-1' } : opts.user } }),
    },
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return chain;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe('fetchMyLatestPaymentInstructions', () => {
  it('scopes the query to the signed-in caller and returns the newest instructions', async () => {
    const { supabase, calls } = createMockSupabase({
      rows: [{ payment_instructions: 'Nequi 300 123 4567' }, { payment_instructions: 'older' }],
    });
    const result = await fetchMyLatestPaymentInstructions(supabase);
    expect(result).toEqual({ success: true, data: 'Nequi 300 123 4567' });
    expect(calls).toContainEqual({ method: 'from', args: ['sessions'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['creator_id', 'host-1'] });
    expect(calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: false, nullsFirst: false }] });
  });

  it('skips whitespace-only instructions', async () => {
    const { supabase } = createMockSupabase({
      rows: [{ payment_instructions: '   ' }, { payment_instructions: 'https://bold.co/a' }],
    });
    expect(await fetchMyLatestPaymentInstructions(supabase)).toEqual({ success: true, data: 'https://bold.co/a' });
  });

  it('returns null when the caller has no earlier instructions', async () => {
    const { supabase } = createMockSupabase({ rows: [] });
    expect(await fetchMyLatestPaymentInstructions(supabase)).toEqual({ success: true, data: null });
  });

  it('returns null without querying when signed out', async () => {
    const { supabase, calls } = createMockSupabase({ user: null });
    expect(await fetchMyLatestPaymentInstructions(supabase)).toEqual({ success: true, data: null });
    expect(calls).toEqual([]);
  });

  it('reports a query error', async () => {
    const { supabase } = createMockSupabase({ error: { message: 'boom' } });
    expect(await fetchMyLatestPaymentInstructions(supabase)).toEqual({ success: false, error: 'boom' });
  });
});
