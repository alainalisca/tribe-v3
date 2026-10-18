import { describe, it, expect, vi } from 'vitest';

vi.mock('./users', () => ({ fetchAdminUserIds: vi.fn(async () => ({ success: true, data: ['a-from-rpc'] })) }));

import { hiddenAdminIds, isVisibleUser, visibleUsersFilter, withoutAdmins } from './visibleUsers';

/** T-JOIN1 Part C: one rule for every public list. */
const ADMIN = '11111111-1111-4111-8111-111111111111';

function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const q = {
    not: (...a: unknown[]) => (calls.push(['not', ...a]), q),
    is: (...a: unknown[]) => (calls.push(['is', ...a]), q),
  };
  return { q, calls };
}

describe('isVisibleUser', () => {
  it.each([
    [{ is_admin: true }, false],
    [{ is_test_account: true }, false],
    [{ banned: true }, false],
    [{ deleted_at: '2026-10-10T00:00:00Z' }, false],
    [{ is_admin: false, is_test_account: false, banned: false, deleted_at: null }, true],
    [{ is_admin: null, is_test_account: null, banned: null, deleted_at: null }, true],
  ])('%o -> %s', (u, expected) => {
    expect(isVisibleUser(u)).toBe(expected);
  });

  it('a missing user is not visible', () => {
    expect(isVisibleUser(null)).toBe(false);
  });
});

describe('visibleUsersFilter', () => {
  it('filters test, banned and deleted on the row, and admins by id', () => {
    const { q, calls } = recorder();
    visibleUsersFilter(q, { idColumn: 'id', adminIds: [ADMIN] });
    expect(calls).toEqual([
      ['not', 'is_test_account', 'is', true],
      ['not', 'banned', 'is', true],
      ['is', 'deleted_at', null],
      ['not', 'id', 'in', `(${ADMIN})`],
    ]);
  });

  it('works on an embedded users row', () => {
    const { q, calls } = recorder();
    visibleUsersFilter(q, { prefix: 'creator.', idColumn: 'creator_id', adminIds: [ADMIN] });
    expect(calls[0]).toEqual(['not', 'creator.is_test_account', 'is', true]);
    expect(calls[3]).toEqual(['not', 'creator_id', 'in', `(${ADMIN})`]);
  });

  it('never names is_admin (anon and authenticated cannot read it, migration 113)', () => {
    const { q, calls } = recorder();
    visibleUsersFilter(q, { idColumn: 'id', adminIds: [ADMIN] });
    expect(JSON.stringify(calls)).not.toContain('is_admin');
  });

  it('adds no admin clause without ids, and drops anything that is not a uuid', () => {
    const { q, calls } = recorder();
    visibleUsersFilter(q, { idColumn: 'id', adminIds: ['x),or=(id.eq.1'] });
    expect(calls).toHaveLength(3);
    const w = recorder();
    withoutAdmins(w.q, 'id', []);
    expect(w.calls).toHaveLength(0);
  });
});

describe('hiddenAdminIds', () => {
  it('reads admins with the RPC for a user client', async () => {
    expect(await hiddenAdminIds({} as never)).toEqual(['a-from-rpc']);
  });

  it('reads users.is_admin directly with the service role', async () => {
    const eq = vi.fn(async () => ({ data: [{ id: ADMIN }], error: null }));
    const client = { from: () => ({ select: () => ({ eq }) }) };
    expect(await hiddenAdminIds(client as never, { serviceRole: true })).toEqual([ADMIN]);
    expect(eq).toHaveBeenCalledWith('is_admin', true);
  });
});
