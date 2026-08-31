import { describe, it, expect, vi } from 'vitest';
import { fetchUsersForReengagementEmail } from './users';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

/**
 * Minimal in-memory `users` table that applies the exact filter chain
 * fetchUsersForReengagementEmail builds, so the dedup window, the created cutoff,
 * the NULLS-FIRST order, and the cap are exercised end to end rather than just
 * asserted as call arguments.
 */
function makeUsersDb(rows: Array<Record<string, unknown>>) {
  let result = [...rows];
  const builder: Record<string, unknown> = {
    select: () => builder,
    is: (col: string, val: unknown) => {
      result = result.filter((r) => (val === null ? r[col] == null : r[col] === val));
      return builder;
    },
    not: (col: string, _op: string, val: unknown) => {
      result = result.filter((r) => (val === null ? r[col] != null : r[col] !== val));
      return builder;
    },
    lt: (col: string, val: string) => {
      result = result.filter((r) => r[col] != null && (r[col] as string) < val);
      return builder;
    },
    or: (expr: string) => {
      // "last_reengagement_sent.is.null,last_reengagement_sent.lt.<cutoff>"
      const m = expr.match(/^([a-z_]+)\.is\.null,\1\.lt\.(.+)$/);
      if (m) {
        const col = m[1];
        const cutoff = m[2];
        result = result.filter((r) => r[col] == null || (r[col] as string) < cutoff);
      }
      return builder;
    },
    order: (col: string, { ascending, nullsFirst }: { ascending: boolean; nullsFirst: boolean }) => {
      result = [...result].sort((a, b) => {
        const av = a[col] as string | null;
        const bv = b[col] as string | null;
        if (av == null && bv == null) return 0;
        if (av == null) return nullsFirst ? -1 : 1;
        if (bv == null) return nullsFirst ? 1 : -1;
        return ascending ? (av < bv ? -1 : av > bv ? 1 : 0) : av > bv ? -1 : 1;
      });
      return builder;
    },
    limit: (n: number) => {
      result = result.slice(0, n);
      return builder;
    },
    then: (f?: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
      Promise.resolve({ data: result, error: null }).then(f, r),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub stands in for SupabaseClient
  return { from: () => builder } as any;
}

// Fixed cutoffs the caller would compute; fixtures are dated relative to them.
const REENGAGEMENT_BEFORE = '2026-05-01T00:00:00.000Z'; // 30-day dedup cutoff
const CREATED_BEFORE = '2026-05-15T00:00:00.000Z'; // 14-day age cutoff
const OLD_CREATED = '2025-01-01T00:00:00.000Z';

function user(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@x.com`,
    name: id,
    preferred_language: 'en',
    created_at: OLD_CREATED,
    last_reengagement_sent: null,
    deleted_at: null,
    banned: null,
    is_test_account: null,
    ...over,
  };
}

const OPTS = { reengagementBefore: REENGAGEMENT_BEFORE, createdBefore: CREATED_BEFORE, limit: 150 };

describe('fetchUsersForReengagementEmail', () => {
  it('skips a recently-nudged user and includes a long-ago-nudged and a never-nudged one', async () => {
    const db = makeUsersDb([
      // Nudged ~10 days before the cutoff window opened -> too recent -> skipped.
      user('recent', { last_reengagement_sent: '2026-05-20T00:00:00.000Z' }),
      // Nudged well before the cutoff -> included.
      user('longago', { last_reengagement_sent: '2026-04-01T00:00:00.000Z' }),
      // Never nudged -> included.
      user('never', { last_reengagement_sent: null }),
    ]);

    const res = await fetchUsersForReengagementEmail(db, OPTS);

    expect(res.success).toBe(true);
    // NULLS FIRST: never-nudged drains before the long-ago one; recent is absent.
    expect((res.data ?? []).map((u) => u.id)).toEqual(['never', 'longago']);
  });

  it('excludes accounts newer than the created cutoff, and deleted/banned/test/no-email accounts', async () => {
    const db = makeUsersDb([
      user('ok'),
      user('too_new', { created_at: '2026-05-20T00:00:00.000Z' }),
      user('deleted', { deleted_at: '2026-01-01T00:00:00.000Z' }),
      user('banned', { banned: true }),
      user('test', { is_test_account: true }),
      user('no_email', { email: null }),
    ]);

    const res = await fetchUsersForReengagementEmail(db, OPTS);

    expect((res.data ?? []).map((u) => u.id)).toEqual(['ok']);
  });

  it('caps the result at the requested limit', async () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      user(`u${String(i).padStart(3, '0')}`, { last_reengagement_sent: null })
    );
    const db = makeUsersDb(many);

    const res = await fetchUsersForReengagementEmail(db, OPTS);

    expect(res.data).toHaveLength(150);
  });
});
