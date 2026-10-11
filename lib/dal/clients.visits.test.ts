import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listVisitsForClient, getClientVisitsSummary } from './clients';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

vi.mock('@/lib/auth/premium', () => ({
  requireTribeOSPremium: vi.fn(),
}));

function buildVisitsMock(opts: {
  rows?: Record<string, unknown>[];
  count?: number;
  error?: { message: string; code?: string } | null;
}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table !== 'client_visits') throw new Error(`unexpected table: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.range = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = () =>
        Promise.resolve({ data: (opts.rows ?? [])[0] ?? null, error: opts.error ?? null });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: opts.rows ?? [], count: opts.count ?? (opts.rows ?? []).length, error: opts.error ?? null });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const SAMPLE_VISIT = {
  id: 'v1',
  visited_at: '2026-10-05T14:30:00Z',
  class_name: 'CrossFit',
  coach_name: 'Coach Darian',
  source: 'mira_csv',
};

describe('listVisitsForClient', () => {
  it('returns paginated visits', async () => {
    const supabase = buildVisitsMock({ rows: [SAMPLE_VISIT], count: 30 });
    const result = await listVisitsForClient(supabase, 'client-1', 1);
    expect(result.success).toBe(true);
    if (!result.success || !result.data) return;
    expect(result.data.visits).toHaveLength(1);
    expect(result.data.visits[0].id).toBe('v1');
    expect(result.data.total).toBe(30);
  });

  it('returns empty when no visits', async () => {
    const supabase = buildVisitsMock({ rows: [], count: 0 });
    const result = await listVisitsForClient(supabase, 'c1', 1);
    expect(result.success).toBe(true);
    if (!result.success || !result.data) return;
    expect(result.data.visits).toHaveLength(0);
    expect(result.data.total).toBe(0);
  });

  it('returns error on DB failure', async () => {
    const supabase = buildVisitsMock({ error: { message: 'timeout' } });
    const result = await listVisitsForClient(supabase, 'c1', 1);
    expect(result.success).toBe(false);
  });
});

describe('getClientVisitsSummary', () => {
  it('returns total visits and last visit', async () => {
    const supabase = {
      from: (table: string) => {
        if (table !== 'client_visits') throw new Error(`unexpected table: ${table}`);
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () =>
          Promise.resolve({ data: { visited_at: '2026-10-09T10:00:00Z' }, error: null });
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: null, count: 42, error: null });
        return chain;
      },
    } as unknown as SupabaseClient;

    const result = await getClientVisitsSummary(supabase, 'c1');
    expect(result.success).toBe(true);
    if (!result.success || !result.data) return;
    expect(result.data.total_visits).toBe(42);
    expect(result.data.last_visit_at).toBe('2026-10-09T10:00:00Z');
  });
});
