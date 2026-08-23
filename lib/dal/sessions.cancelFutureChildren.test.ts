import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { cancelFutureChildren, seriesParentId } from './sessions';
import { bogotaToday } from '@/lib/time/bogotaDate';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

const HOST = 'host-1';
const PARENT_ID = 'parent-1';

interface MockOpts {
  user?: { id: string } | null;
  parentCreator?: string;
  children?: { id: string }[];
  childStatus?: Record<string, string>;
}

/**
 * Table + terminal aware mock. `cancelSession` runs for real against it, so the
 * mock must answer: parent-auth fetch (.single on parentId), the children list
 * (awaited after .gte), each child's session fetch (.single on a child id), the
 * confirmed-participant select (awaited, empty), and the two updates.
 */
function createMock(opts: MockOpts = {}) {
  const { user = { id: HOST }, parentCreator = HOST, children = [{ id: 'c1' }, { id: 'c2' }], childStatus = {} } = opts;
  const cancelledSessionIds: string[] = [];
  const captured: { childrenQuery: Record<string, unknown> | null } = { childrenQuery: null };

  function chain(table: string) {
    const c: Record<string, unknown> = { _eq: {} as Record<string, string> };
    const eqs = c._eq as Record<string, string>;
    c.select = () => c;
    c.eq = (col: string, val: string) => {
      eqs[col] = val;
      return c;
    };
    c.gte = (col: string, val: string) => {
      if (table === 'sessions') {
        captured.childrenQuery = {
          status: eqs['status'],
          parent: eqs['recurring_parent_id'],
          gteCol: col,
          gteVal: val,
        };
        return Promise.resolve({ data: children, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    c.single = async () => {
      if (table === 'sessions') {
        if (eqs['id'] === PARENT_ID) return { data: { creator_id: parentCreator }, error: null };
        const id = eqs['id'];
        return {
          data: {
            id,
            title: 'Yoga',
            creator_id: parentCreator,
            is_paid: false,
            price_cents: null,
            currency: 'COP',
            status: childStatus[id] ?? 'active',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };
    c.update = (payload: Record<string, unknown>) => ({
      eq: async (_col: string, val: string) => {
        if (table === 'sessions' && payload.status === 'cancelled') cancelledSessionIds.push(val);
        return { error: null };
      },
    });
    // Awaited selects with no .gte/.single (the confirmed-participant read).
    c.then = (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(f, r);
    return c;
  }

  const supabase = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => chain(table),
  } as unknown as SupabaseClient;

  return { supabase, cancelledSessionIds, captured };
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://test.tribe.app';
  process.env.CRON_SECRET = 'x';
});

describe('seriesParentId', () => {
  it('a child targets its parent', () => {
    expect(seriesParentId({ id: 'c1', recurring_parent_id: 'p1' })).toBe('p1');
  });
  it('a parent (or one-off) targets itself', () => {
    expect(seriesParentId({ id: 'p1', recurring_parent_id: null })).toBe('p1');
    expect(seriesParentId({ id: 'o1', recurring_parent_id: null })).toBe('o1');
  });
});

describe('cancelFutureChildren', () => {
  it('cancels every future active child (parent or child end-series both target the parent id)', async () => {
    const { supabase, cancelledSessionIds } = createMock();
    const result = await cancelFutureChildren(supabase, PARENT_ID);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ cancelled: 2, failed: [] });
    expect(cancelledSessionIds.sort()).toEqual(['c1', 'c2']);
  });

  it('only queries FUTURE ACTIVE children — past children are never touched', async () => {
    const { supabase, captured } = createMock();
    await cancelFutureChildren(supabase, PARENT_ID);
    // The filter that excludes past + non-active rows entirely.
    expect(captured.childrenQuery).toMatchObject({
      status: 'active',
      parent: PARENT_ID,
      gteCol: 'date',
      gteVal: bogotaToday(),
    });
  });

  it('reports partial failure and keeps going (destructive bulk never aborts halfway)', async () => {
    // c2 is already cancelled -> cancelSession refuses it; c1 still cancels.
    const { supabase, cancelledSessionIds } = createMock({ childStatus: { c2: 'cancelled' } });
    const result = await cancelFutureChildren(supabase, PARENT_ID);
    expect(result.success).toBe(true);
    expect(result.data?.cancelled).toBe(1);
    expect(result.data?.failed).toEqual(['c2']);
    expect(cancelledSessionIds).toEqual(['c1']);
  });

  it('rejects a non-owner and cancels nothing', async () => {
    const { supabase, cancelledSessionIds } = createMock({ user: { id: 'intruder' } });
    const result = await cancelFutureChildren(supabase, PARENT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/host/i);
    expect(cancelledSessionIds).toEqual([]);
  });
});
