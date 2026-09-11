/**
 * The Featured Affiliate carousel is ordered by editorial placement first (161).
 *
 * The point of the column is that `tier` must NOT decide placement: tier is a
 * commercial field, and using it would say a partner appears first because it
 * pays more. So the assertion that matters here is the ORDER of the sort keys,
 * not merely that display_order is mentioned.
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchActivePartners } from './featuredPartners';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

/** Records the sequence of .order() calls so the test can assert precedence. */
function client(rows: unknown[] = []) {
  const orders: { column: string; ascending?: boolean }[] = [];
  let selected = '';
  const builder: Record<string, unknown> = {
    select: vi.fn((cols: string) => {
      selected = cols;
      return builder;
    }),
    eq: vi.fn(() => builder),
    order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
      orders.push({ column, ascending: opts?.ascending });
      return builder;
    }),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return { client: { from: vi.fn(() => builder) } as never, orders, selected: () => selected };
}

describe('fetchActivePartners ordering', () => {
  it('sorts by display_order before anything else', async () => {
    const c = client();
    await fetchActivePartners(c.client);
    expect(c.orders[0]).toEqual({ column: 'display_order', ascending: false });
  });

  it('keeps tier and total_impressions below it, in that order', async () => {
    // tier must never be the primary key: it is what the partner pays, not
    // where the platform wants them.
    const c = client();
    await fetchActivePartners(c.client);
    expect(c.orders.map((o) => o.column)).toEqual(['display_order', 'tier', 'total_impressions']);
  });

  it('leaves the impression rotation intact for everything that ties', async () => {
    // Every partner sits at display_order 0 until one is placed deliberately,
    // so the least-seen-first rotation must still be the effective sort.
    const c = client();
    await fetchActivePartners(c.client);
    expect(c.orders.at(-1)).toEqual({ column: 'total_impressions', ascending: true });
  });

  it('names display_order in the select, or the sort reads a column it never fetched', async () => {
    const c = client();
    await fetchActivePartners(c.client);
    expect(c.selected()).toContain('display_order');
  });
});
