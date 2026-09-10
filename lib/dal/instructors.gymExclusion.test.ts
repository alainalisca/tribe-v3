/**
 * DoD 4: /instructors must not list gym accounts among instructors.
 *
 * A gym account is an ordinary users row with is_instructor = true -- there is
 * no account_type column -- so nothing about the row itself distinguishes
 * "CrossFit BullBox" from a person. The exclusion has to come from
 * featured_partners, and it has to key on business_type: both partners live
 * today are 'independent' solo trainers who belong in the list.
 */
import { describe, it, expect, vi } from 'vitest';

const orgIds = vi.fn();
vi.mock('./gymVenue', () => ({ fetchOrganizationUserIds: (...args: unknown[]) => orgIds(...args) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/avatar', () => ({ resolveAvatarUrl: (a: string | null) => a }));

import { fetchInstructors } from './instructors';

/** Records every builder call so the test can assert on the .not() filter. */
function client(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'contains', 'ilike', 'order', 'limit', 'not']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return { client: { from: vi.fn(() => builder) } as never, calls };
}

describe('fetchInstructors excludes organization accounts', () => {
  it('adds a NOT IN filter naming the gym user ids', async () => {
    orgIds.mockResolvedValue({ success: true, data: ['gym-user-1', 'gym-user-2'] });
    const { client: c, calls } = client([]);

    await fetchInstructors(c);

    const notCall = calls.find((call) => call.method === 'not');
    expect(notCall).toBeDefined();
    expect(notCall?.args[0]).toBe('id');
    expect(notCall?.args[1]).toBe('in');
    expect(notCall?.args[2]).toBe('(gym-user-1,gym-user-2)');
  });

  it('adds no filter when there are no gyms, rather than an empty IN ()', async () => {
    // `.not('id','in','()')` is a syntax error at PostgREST and would break the
    // whole instructor list -- which is the state of the database today, since
    // no gym exists yet.
    orgIds.mockResolvedValue({ success: true, data: [] });
    const { client: c, calls } = client([]);

    await fetchInstructors(c);

    expect(calls.find((call) => call.method === 'not')).toBeUndefined();
  });

  it('still lists instructors when the partner lookup fails', async () => {
    // A failed exclusion must not empty the discover page: showing a gym tile
    // among instructors is a cosmetic bug, showing nothing is a broken page.
    orgIds.mockResolvedValue({ success: false, error: 'boom' });
    const { client: c, calls } = client([]);

    const result = await fetchInstructors(c);

    expect(calls.find((call) => call.method === 'not')).toBeUndefined();
    expect(result.success).toBe(true);
  });
});
