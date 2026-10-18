import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/storage/privateMedia', () => ({ signRecapPhotoUrls: vi.fn() }));

import { fetchUpcomingSessions } from './sessions';

/** The feed never shows a test session (T-JOIN1b) or one by a test, banned or deleted account; admin hosts are ordinary. */
const ADMIN = '11111111-1111-4111-8111-111111111111';

function client() {
  const calls: [string, ...unknown[]][] = [];
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'not', 'is', 'order']) {
    b[m] = (...a: unknown[]) => (calls.push([m, ...a]), b);
  }
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [{ id: 's1' }], error: null });
  const rpc = vi.fn(async () => ({ data: [ADMIN], error: null }));
  return { c: { from: () => b, rpc } as never, calls, rpc };
}

describe('fetchUpcomingSessions visibility', () => {
  it('joins the creator !inner and filters through the shared rule', async () => {
    const { c, calls, rpc } = client();
    const res = await fetchUpcomingSessions(c);
    expect(res.success).toBe(true);
    // T-JOIN1b: admins are ordinary, so no admin lookup.
    expect(rpc).not.toHaveBeenCalled();
    expect(String(calls.find((x) => x[0] === 'select')?.[1])).toContain(
      'creator:users!sessions_creator_id_fkey!inner('
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        ['not', 'creator.is_test_account', 'is', true],
        ['not', 'creator.banned', 'is', true],
        ['is', 'creator.deleted_at', null],
        ['eq', 'is_test', false],
      ])
    );
    expect(calls).not.toContainEqual(['not', 'creator_id', 'in', `(${ADMIN})`]);
  });
});
