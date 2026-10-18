import { describe, it, expect } from 'vitest';
import { isVisibleUser, visibleUsersFilter, VISIBLE_USER_FLAGS } from './visibleUsers';

/**
 * T-JOIN1 Part C, revised in T-JOIN1b: one rule for every public list. A test
 * account, a banned or a deleted user never appears; an admin is ordinary
 * (a test session is marked on the session, sessions.is_test).
 */
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
    [{ is_test_account: true }, false],
    [{ banned: true }, false],
    [{ deleted_at: '2026-10-10T00:00:00Z' }, false],
    [{ is_test_account: false, banned: false, deleted_at: null }, true],
    [{ is_test_account: null, banned: null, deleted_at: null }, true],
  ])('%o -> %s', (u, expected) => {
    expect(isVisibleUser(u)).toBe(expected);
  });

  it('an admin is visible like anyone else (T-JOIN1b)', () => {
    expect(isVisibleUser({ is_admin: true, is_test_account: false, banned: false, deleted_at: null } as never)).toBe(
      true
    );
  });

  it('a missing user is not visible', () => {
    expect(isVisibleUser(null)).toBe(false);
  });
});

describe('visibleUsersFilter', () => {
  it('filters test, banned and deleted on the row', () => {
    const { q, calls } = recorder();
    visibleUsersFilter(q);
    expect(calls).toEqual([
      ['not', 'is_test_account', 'is', true],
      ['not', 'banned', 'is', true],
      ['is', 'deleted_at', null],
    ]);
  });

  it('works on an embedded users row', () => {
    const { q, calls } = recorder();
    visibleUsersFilter(q, { prefix: 'creator.' });
    expect(calls[0]).toEqual(['not', 'creator.is_test_account', 'is', true]);
  });

  it('never filters on admin status, in any shape', () => {
    const { q, calls } = recorder();
    visibleUsersFilter(q, { prefix: 'creator.' });
    expect(JSON.stringify(calls)).not.toMatch(/is_admin|creator_id|not.*in/);
    expect(VISIBLE_USER_FLAGS).not.toContain('is_admin');
  });
});
