/**
 * A partner reading their own pass leads (T-LEAD2 part D).
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE, said up front because the spec asks for
 * a negative test and it would be easy to write one here that means nothing.
 *
 * The thing that stops one partner reading another's rows is migration 173's
 * "Partner reads own leads" policy, INSIDE THE DATABASE. A mocked client
 * returns whatever the test hands it, so an assertion here that partner B sees
 * zero of partner A's rows would be asserting that the mock returned the empty
 * array the test put in it. That is the vacuous-check family CLAUDE.md records,
 * and it would read as coverage of the exact property nobody had checked.
 *
 * So the negative test is a probe against production, shown in the PR and
 * recorded in the module header of partnerLeads.ts. What this file checks is
 * the half a mock CAN see: that the QUESTION asked of the database is the right
 * one -- one partner's rows, newest first, a window rather than the table, the
 * tiles carrying the same scope as the rows, and no escape hatch that would let
 * a caller ask for everything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { fetchPartnerLeads, PARTNER_LEADS_PAGE_SIZE } from './partnerLeads';

interface Call {
  table: string;
  method: string;
  args: unknown[];
}

function client(rows: unknown[] = [], count = rows.length) {
  const calls: Call[] = [];

  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'range', 'gte', 'is', 'not', 'limit']) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return builder;
      });
    }
    builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null, count });
    return builder;
  };

  return { client: { from: vi.fn((table: string) => makeBuilder(table)) } as never, calls };
}

const LEAD = {
  id: 'lead-1',
  created_at: '2026-09-18T13:42:08.017Z',
  name: 'Ana',
  whatsapp: '+573001112233',
  email: 'ana@example.com',
  choice_1: 'HYROX',
  choice_2: 'Mañana',
  pass_code: 'BB-4F7K',
  src: 'app',
  code: 'APP-CARD',
  notified_at: '2026-09-18T13:42:10.000Z',
  contacted_at: null,
};

const PARTNER = 'p-bullbox';

beforeEach(() => vi.clearAllMocks());

describe('fetchPartnerLeads scoping', () => {
  it('scopes the row read itself, not only the counts around it', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    // The rows query is the one that ends in range(); the tiles run after it.
    // So an eq BEFORE that range belongs to the row read, and asserting on the
    // flat list of eqs instead would pass on a build where the rows query lost
    // its scope and only the tiles kept theirs.
    const rangeAt = calls.findIndex((call) => call.method === 'range');
    expect(rangeAt).toBeGreaterThan(-1);

    const rowScope = calls.slice(0, rangeAt).filter((call) => call.method === 'eq');
    expect(rowScope).toHaveLength(1);
    expect(rowScope[0].args).toEqual(['partner_id', PARTNER]);

    // And every other equality is the same one. A second eq on some other
    // column would be a silently narrower list than the tiles are counting.
    for (const eq of calls.filter((call) => call.method === 'eq')) {
      expect(eq.args).toEqual(['partner_id', PARTNER]);
    }
  });

  it('carries the partner scope onto all three tiles, not only the rows', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    // One eq for the page plus one for each tile. A tile that forgot it would
    // count every partner's leads and report another gym's number on this
    // gym's dashboard.
    expect(calls.filter((call) => call.method === 'eq').length).toBe(4);
  });

  it('does not touch the database at all before the partner id resolves', async () => {
    const { client: c, calls } = client([LEAD]);
    const result = await fetchPartnerLeads(c, '');

    // Asserted on from(), the EARLIEST observable point. Asserting on range()
    // or on the awaited result would still pass if the guard were deleted,
    // because an unscoped read would reach further in, not less far.
    expect((c as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ rows: [], total: 0, tiles: { last7: 0, uncontacted: 0, total: 0 } });
  });
});

describe('fetchPartnerLeads paging', () => {
  it('reads a window, not the whole table', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER, { offset: 50 });

    const range = calls.find((call) => call.method === 'range');
    expect(range?.args).toEqual([50, 50 + PARTNER_LEADS_PAGE_SIZE - 1]);
  });

  it('orders newest first', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    const order = calls.find((call) => call.method === 'order');
    expect(order?.args).toEqual(['created_at', { ascending: false }]);
  });

  it('returns the partner total, not the page length, so the pager can end', async () => {
    const { client: c } = client([LEAD], 120);
    const result = await fetchPartnerLeads(c, PARTNER);

    expect(result.data!.total).toBe(120);
    expect(result.data!.rows).toHaveLength(1);
  });
});

describe('fetchPartnerLeads tiles', () => {
  it('counts uncontacted by contacted_at being null, not by a flag that does not exist', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    expect(calls.some((call) => call.method === 'is' && call.args[0] === 'contacted_at' && call.args[1] === null)).toBe(
      true
    );
  });

  it('bounds the 7 day tile by created_at rather than counting everything', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    const gte = calls.find((call) => call.method === 'gte');
    expect(gte?.args[0]).toBe('created_at');
    expect(Date.parse(gte?.args[1] as string)).toBeLessThan(Date.now());
  });

  it('transfers no rows for the counts', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    const heads = calls.filter(
      (call) => call.method === 'select' && (call.args[1] as { head?: boolean } | undefined)?.head === true
    );
    expect(heads).toHaveLength(3);
  });
});

describe('fetchPartnerLeads selection', () => {
  it('selects every column the table renders, so no cell can silently blank', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    const select = calls.find((call) => call.method === 'select' && typeof call.args[0] === 'string');
    const columns = String(select!.args[0])
      .split(',')
      .map((s) => s.trim());

    // Keyed on what LeadsTable reads, not on the string the DAL happens to
    // hold: dropping notified_at from the select would empty the "Email
    // enviado" column with no error anywhere.
    for (const column of [
      'id',
      'created_at',
      'name',
      'whatsapp',
      'email',
      'choice_1',
      'choice_2',
      'pass_code',
      'src',
      'code',
      'notified_at',
      'contacted_at',
    ]) {
      expect(columns).toContain(column);
    }
  });

  it('never selects star, which would carry consent text and user agent per row', async () => {
    const { client: c, calls } = client([LEAD]);
    await fetchPartnerLeads(c, PARTNER);

    const selects = calls.filter((call) => call.method === 'select');
    for (const select of selects) {
      expect(String(select.args[0])).not.toBe('*');
    }
  });
});

describe('fetchPartnerLeads failure', () => {
  it('reports a failed read rather than rendering it as an empty list', async () => {
    const calls: Call[] = [];
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'range', 'gte', 'is']) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ table: 'pass_leads', method: m, args });
        return builder;
      });
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: null, error: { message: 'permission denied for table pass_leads' }, count: null });
    const c = { from: vi.fn(() => builder) } as never;

    const result = await fetchPartnerLeads(c, PARTNER);

    // A 42501 that renders as "no leads yet" tells a gym their pass is not
    // working when the truth is that their read was refused.
    expect(result.success).toBe(false);
    expect(result.error).toContain('permission denied');
  });
});
