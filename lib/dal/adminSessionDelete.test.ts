import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));

import { adminDeleteSession } from './adminSessionDelete';
import { logError } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A minimal fake of the service client. Each table answers from a script, and
 * every DELETE is recorded, because the property that matters most in this file
 * is NEGATIVE: on every refusal path, no DELETE was ever issued. Asserting the
 * returned error alone would pass against code that deleted first and then
 * reported the refusal.
 */
interface Script {
  target?: { data: unknown; error: unknown };
  children?: { data: unknown; error: unknown };
  payments?: { count: number | null; error: unknown };
  del?: { data: unknown; error: unknown };
}

function fakeService(script: Script) {
  const deletes: { ids: unknown }[] = [];
  const childQueries: { col: string; val: unknown }[] = [];
  const paymentQueries: { ids: unknown }[] = [];

  const from = (table: string) => {
    if (table === 'payments') {
      return {
        select: () => ({
          in: (_col: string, ids: unknown) => {
            paymentQueries.push({ ids });
            return Promise.resolve(script.payments ?? { count: 0, error: null });
          },
        }),
      };
    }
    // sessions
    return {
      select: (cols: string) => ({
        eq: (col: string, val: unknown) => {
          if (cols.includes('is_recurring')) {
            return { maybeSingle: () => Promise.resolve(script.target ?? { data: null, error: null }) };
          }
          childQueries.push({ col, val });
          return Promise.resolve(script.children ?? { data: [], error: null });
        },
      }),
      delete: () => ({
        in: (_col: string, ids: unknown) => ({
          select: () => {
            deletes.push({ ids });
            return Promise.resolve(script.del ?? { data: [], error: null });
          },
        }),
      }),
    };
  };

  return { client: { from } as unknown as SupabaseClient, deletes, childQueries, paymentQueries };
}

const ONE_OFF = { id: 's1', is_recurring: false, recurring_parent_id: null };

beforeEach(() => vi.clearAllMocks());

describe('adminDeleteSession', () => {
  it('deletes a one-off session with no payments', async () => {
    const f = fakeService({
      target: { data: ONE_OFF, error: null },
      del: { data: [{ id: 's1' }], error: null },
    });
    const r = await adminDeleteSession(f.client, 's1');
    expect(r).toEqual({ success: true, data: { deletedIds: ['s1'], wasSeries: false } });
    expect(f.deletes).toEqual([{ ids: ['s1'] }]);
  });

  it('returns session_not_found and deletes nothing when the row is missing', async () => {
    const f = fakeService({ target: { data: null, error: null } });
    expect(await adminDeleteSession(f.client, 'nope')).toEqual({ success: false, error: 'session_not_found' });
    expect(f.deletes).toHaveLength(0);
  });

  it('REFUSES a session with payment records, and never issues the DELETE', async () => {
    const f = fakeService({ target: { data: ONE_OFF, error: null }, payments: { count: 2, error: null } });
    expect(await adminDeleteSession(f.client, 's1')).toEqual({ success: false, error: 'has_payments' });
    expect(f.deletes).toHaveLength(0);
  });

  it('FAILS CLOSED when the payment check itself errors', async () => {
    const f = fakeService({
      target: { data: ONE_OFF, error: null },
      payments: { count: null, error: { message: 'relation "payments" does not exist' } },
    });
    expect(await adminDeleteSession(f.client, 's1')).toEqual({ success: false, error: 'check_failed' });
    expect(f.deletes).toHaveLength(0);
    // Recognised, not just tidy: the failure was logged with its reason.
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('payments') }),
      expect.objectContaining({ action: 'adminDeleteSession.payments' })
    );
  });

  it('refuses a series without scope=series, and deletes nothing', async () => {
    const f = fakeService({
      target: { data: { id: 'p', is_recurring: true, recurring_parent_id: null }, error: null },
      children: { data: [{ id: 'c1' }], error: null },
    });
    expect(await adminDeleteSession(f.client, 'p')).toEqual({ success: false, error: 'series_requires_scope' });
    expect(await adminDeleteSession(f.client, 'p', { scope: 'single' })).toEqual({
      success: false,
      error: 'series_requires_scope',
    });
    expect(f.deletes).toHaveLength(0);
  });

  it('resolves a CHILD occurrence to its whole series (parent + every child)', async () => {
    // Deleting one child alone would be recreated by the recurring cron.
    const f = fakeService({
      target: { data: { id: 'c2', is_recurring: false, recurring_parent_id: 'p' }, error: null },
      children: { data: [{ id: 'c1' }, { id: 'c2' }], error: null },
      del: { data: [{ id: 'p' }, { id: 'c1' }, { id: 'c2' }], error: null },
    });
    const r = await adminDeleteSession(f.client, 'c2', { scope: 'series' });
    expect(f.childQueries).toEqual([{ col: 'recurring_parent_id', val: 'p' }]);
    expect(f.deletes).toEqual([{ ids: ['p', 'c1', 'c2'] }]);
    // The payment check covered the whole series, not just the clicked row.
    expect(f.paymentQueries).toEqual([{ ids: ['p', 'c1', 'c2'] }]);
    expect(r).toEqual({ success: true, data: { deletedIds: ['p', 'c1', 'c2'], wasSeries: true } });
  });

  it('refuses a series when ANY occurrence has a payment', async () => {
    const f = fakeService({
      target: { data: { id: 'p', is_recurring: true, recurring_parent_id: null }, error: null },
      children: { data: [{ id: 'c1' }], error: null },
      payments: { count: 1, error: null },
    });
    expect(await adminDeleteSession(f.client, 'p', { scope: 'series' })).toEqual({
      success: false,
      error: 'has_payments',
    });
    expect(f.deletes).toHaveLength(0);
  });

  it('maps a foreign-key refusal (23503) to linked_records', async () => {
    const f = fakeService({
      target: { data: ONE_OFF, error: null },
      del: { data: null, error: { code: '23503', message: 'violates foreign key constraint' } },
    });
    expect(await adminDeleteSession(f.client, 's1')).toEqual({ success: false, error: 'linked_records' });
  });

  it('does not claim success when the DELETE removed zero rows', async () => {
    const f = fakeService({ target: { data: ONE_OFF, error: null }, del: { data: [], error: null } });
    expect(await adminDeleteSession(f.client, 's1')).toEqual({ success: false, error: 'session_not_found' });
  });
});
