/**
 * The admin leads read (T-LEAD2 part B).
 *
 * The mock records every builder call, because the things most likely to be
 * wrong here are not the returned rows but the QUESTIONS asked of the database:
 * whether the tiles carry the partner filter, whether the page is a window or
 * the whole table, and whether the account match is case-exact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { fetchAdminLeads, ADMIN_LEADS_PAGE_SIZE, ADMIN_LEADS_ALL_PARTNERS } from './adminLeads';

interface Call {
  table: string;
  method: string;
  args: unknown[];
}

/**
 * A Supabase double that answers per table and remembers how it was asked.
 *
 * `count` comes back on every resolve so the head-only tile queries and the
 * counted page query both have one; each table's rows are whatever the test
 * supplied.
 */
function client(tables: Record<string, { rows?: unknown[]; count?: number }>) {
  const calls: Call[] = [];

  const makeBuilder = (table: string) => {
    const answer = tables[table] ?? {};
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'range', 'gte', 'is', 'not', 'in', 'limit']) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return builder;
      });
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: answer.rows ?? [], error: null, count: answer.count ?? (answer.rows ?? []).length });
    return builder;
  };

  return { client: { from: vi.fn((table: string) => makeBuilder(table)) } as never, calls };
}

const LEAD = {
  id: 'lead-1',
  created_at: '2026-09-18T13:42:08.017Z',
  partner_id: 'p-bullbox',
  name: 'Ana',
  whatsapp: '+573001112233',
  email: 'Ana@Example.com',
  choice_1: 'HYROX',
  choice_2: 'Mañana',
  pass_code: 'BB-4F7K',
  src: 'app',
  code: 'APP-CARD',
  notified_at: '2026-09-18T13:42:10.000Z',
  contacted_at: null,
};

function defaults(overrides: Record<string, { rows?: unknown[]; count?: number }> = {}) {
  return {
    pass_leads: { rows: [LEAD], count: 1 },
    featured_partners: { rows: [{ id: 'p-bullbox', business_name: 'CrossFit BullBox' }] },
    users: { rows: [] },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('fetchAdminLeads paging', () => {
  it('reads a window, not the whole table', async () => {
    const { client: c, calls } = client(defaults());
    await fetchAdminLeads(c, { offset: 50 });

    const range = calls.find((call) => call.method === 'range');
    expect(range).toBeDefined();
    // 50..99 inclusive. An off-by-one here either drops a lead between pages or
    // shows one twice, and both look like a database problem from the outside.
    expect(range!.args).toEqual([50, 50 + ADMIN_LEADS_PAGE_SIZE - 1]);
  });

  it('returns the total matching rows, not the page length, so the pager can end', async () => {
    const { client: c } = client(defaults({ pass_leads: { rows: [LEAD], count: 137 } }));
    const result = await fetchAdminLeads(c);
    expect(result.success).toBe(true);
    expect(result.data!.total).toBe(137);
  });

  it('orders newest first', async () => {
    const { client: c, calls } = client(defaults());
    await fetchAdminLeads(c);
    const order = calls.find((call) => call.table === 'pass_leads' && call.method === 'order');
    expect(order!.args[0]).toBe('created_at');
    expect(order!.args[1]).toMatchObject({ ascending: false });
  });
});

describe('fetchAdminLeads partner filter', () => {
  it('does not filter for the Todos sentinel', async () => {
    const { client: c, calls } = client(defaults());
    await fetchAdminLeads(c, { partnerId: ADMIN_LEADS_ALL_PARTNERS });
    expect(calls.filter((call) => call.method === 'eq' && call.args[0] === 'partner_id')).toHaveLength(0);
  });

  /**
   * THE TILES MUST CARRY THE FILTER.
   *
   * A tile counting every partner's leads above a table showing one partner's
   * is a number about a different population than the one on screen -- the
   * failure CLAUDE.md records under counting instructors without the gates
   * /instructors applies. Asserted as a count of filtered queries rather than
   * on one of them, so a tile added later without the filter fails this.
   */
  it('applies the partner filter to the page AND to all three tiles', async () => {
    const { client: c, calls } = client(defaults());
    await fetchAdminLeads(c, { partnerId: 'p-bullbox' });

    const filtered = calls.filter(
      (call) => call.table === 'pass_leads' && call.method === 'eq' && call.args[0] === 'partner_id'
    );
    // one page query + three tiles
    expect(filtered).toHaveLength(4);
    for (const call of filtered) expect(call.args[1]).toBe('p-bullbox');
  });

  it('counts uncontacted by contacted_at being null, not by a flag that does not exist', async () => {
    const { client: c, calls } = client(defaults());
    await fetchAdminLeads(c);
    expect(calls.some((call) => call.method === 'is' && call.args[0] === 'contacted_at' && call.args[1] === null)).toBe(
      true
    );
  });
});

describe('fetchAdminLeads account match', () => {
  it('matches a lead to an account case-insensitively', async () => {
    // The lead typed "Ana@Example.com"; the account is stored lowercase. A raw
    // comparison would miss it, which is the whole reason the match lowercases
    // both sides rather than filtering on the indexed raw column.
    const { client: c } = client(defaults({ users: { rows: [{ email: 'ana@example.com' }] } }));
    const result = await fetchAdminLeads(c);
    expect(result.data!.rows[0].hasTribeAccount).toBe(true);
  });

  it('reports no account when nothing matches, rather than defaulting to yes', async () => {
    const { client: c } = client(defaults({ users: { rows: [{ email: 'someone.else@example.com' }] } }));
    const result = await fetchAdminLeads(c);
    expect(result.data!.rows[0].hasTribeAccount).toBe(false);
  });

  it('does not match on a prefix or a domain', async () => {
    // "ana@example.com.co" is a different person. A contains/startsWith match
    // would claim otherwise and send Al into the wrong conversation.
    const { client: c } = client(defaults({ users: { rows: [{ email: 'ana@example.com.co' }] } }));
    const result = await fetchAdminLeads(c);
    expect(result.data!.rows[0].hasTribeAccount).toBe(false);
  });

  it('excludes soft-deleted accounts from the match', async () => {
    const { client: c, calls } = client(defaults());
    await fetchAdminLeads(c);
    expect(calls.some((call) => call.table === 'users' && call.method === 'is' && call.args[0] === 'deleted_at')).toBe(
      true
    );
  });

  it('skips the account read entirely when the page is empty', async () => {
    const { client: c, calls } = client(defaults({ pass_leads: { rows: [], count: 0 } }));
    await fetchAdminLeads(c);
    expect(calls.some((call) => call.table === 'users')).toBe(false);
  });
});

describe('fetchAdminLeads partner names', () => {
  it('resolves partner_id to a business name for the Aliado column', async () => {
    const { client: c } = client(defaults());
    const result = await fetchAdminLeads(c);
    expect(result.data!.rows[0].partnerName).toBe('CrossFit BullBox');
  });

  /**
   * pass_leads.partner_id is ON DELETE SET NULL, so a lead outlives its
   * partner. The row must still render -- it is still a real person who left a
   * phone number -- with an empty Aliado rather than a crash or "undefined".
   */
  it('leaves the name null for a lead whose partner is gone', async () => {
    const { client: c } = client(
      defaults({
        pass_leads: { rows: [{ ...LEAD, partner_id: null }], count: 1 },
        featured_partners: { rows: [] },
      })
    );
    const result = await fetchAdminLeads(c);
    expect(result.data!.rows[0].partnerName).toBeNull();
  });

  it('offers only partners that actually have leads in the filter', async () => {
    const { client: c } = client(
      defaults({
        featured_partners: {
          rows: [
            { id: 'p-bullbox', business_name: 'CrossFit BullBox' },
            { id: 'p-other', business_name: 'Marce Anahata' },
          ],
        },
      })
    );
    const result = await fetchAdminLeads(c);
    expect(result.data!.partners).toEqual([{ id: 'p-bullbox', name: 'CrossFit BullBox' }]);
  });
});
