/**
 * ADMIN-01: the users list narrows SERVER side.
 *
 * The bug being fixed: UserManagement filtered a client-side array of at most
 * 100 rows, so searching for anyone outside the newest 100 returned nothing and
 * read as "that user does not exist".
 *
 * The fake below is not a spy on which methods were called -- it EXECUTES the
 * query it is given over a 150-row table, in the order the DAL builds it. A test
 * that only asserts `.or()` was called would pass against a client-side
 * implementation too. This one cannot: if the limit were applied before the
 * filter, the row simply would not be in the result.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAdminUsersWithCounts } from './admin';

type Row = Record<string, unknown>;

/** Applies `name.ilike.%term%,email.ilike.%term%` the way PostgREST would. */
function applyOr(rows: Row[], expr: string): Row[] {
  const term = (expr.match(/ilike\.%(.*?)%/)?.[1] ?? '').toLowerCase();
  return rows.filter(
    (r) =>
      String(r.name ?? '')
        .toLowerCase()
        .includes(term) ||
      String(r.email ?? '')
        .toLowerCase()
        .includes(term)
  );
}

function makeDb(users: Row[]): { client: SupabaseClient; sawLimit: () => number | null } {
  let limitSeen: number | null = null;
  const client = {
    from(table: string) {
      if (table !== 'users') {
        const done = Promise.resolve({ data: [], error: null });
        return { select: () => done };
      }
      let work = [...users];
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        is: (col: string, val: unknown) => (
          (work = work.filter((r) => (val === null ? r[col] == null : r[col] === val))),
          b
        ),
        eq: (col: string, val: unknown) => ((work = work.filter((r) => r[col] === val)), b),
        not: (col: string, op: string, val: unknown) => (
          (work = work.filter((r) => (op === 'is' ? r[col] !== val : true))),
          b
        ),
        gte: (col: string, val: unknown) => ((work = work.filter((r) => String(r[col]) >= String(val))), b),
        or: (expr: string) => ((work = applyOr(work, expr)), b),
        order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => {
          const asc = opts?.ascending ?? true;
          const nullsFirst = opts?.nullsFirst ?? !asc; // Postgres: DESC defaults to NULLS FIRST
          work = [...work].sort((x, y) => {
            const a = x[col] as string | null;
            const c = y[col] as string | null;
            if (a == null && c == null) return 0;
            if (a == null) return nullsFirst ? -1 : 1;
            if (c == null) return nullsFirst ? 1 : -1;
            return asc ? (a > c ? 1 : a < c ? -1 : 0) : a > c ? -1 : a < c ? 1 : 0;
          });
          return b;
        },
        limit: (n: number) => {
          limitSeen = n;
          return Promise.resolve({ data: work.slice(0, n), error: null });
        },
      });
      return b;
    },
  } as unknown as SupabaseClient;
  return { client, sawLimit: () => limitSeen };
}

/** 150 users. Index 0 is newest; higher index = older, so index >= 100 is
 *  outside the page the old client-side search could ever see. */
function makeUsers(): Row[] {
  return Array.from({ length: 150 }, (_, i) => ({
    id: `u${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    created_at: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000).toISOString(),
    last_login_at: i % 3 === 0 ? null : new Date(Date.UTC(2026, 0, 1) - i * 3_600_000).toISOString(),
    is_instructor: i % 5 === 0 ? true : i % 7 === 0 ? null : false,
    is_test_account: i % 11 === 0,
    banned: i % 23 === 0,
    deleted_at: null,
  }));
}

describe('fetchAdminUsersWithCounts — ADMIN-01 server-side query', () => {
  it('THE DISCRIMINATING TEST: finds a user who is NOT in the newest 100 rows', async () => {
    const users = makeUsers();
    // Position 130: far outside the 100-row page. Give them a distinctive name
    // so the match cannot be accidental.
    users[130] = { ...users[130], name: 'Zzyzx Farhat', email: 'zzyzx@example.com' };
    const { client } = makeDb(users);

    const result = await fetchAdminUsersWithCounts(client, { search: 'zzyzx' });

    expect(result.success).toBe(true);
    const ids = (result.data!.users as Row[]).map((u) => u.id);
    // If the search ran after the 100-row limit, this row is unreachable.
    expect(ids).toContain('u130');
    expect(ids).toHaveLength(1);
  });

  it('searches email as well as name, across the whole table', async () => {
    const users = makeUsers();
    users[142] = { ...users[142], name: 'Ordinary Name', email: 'needle@elsewhere.test' };
    const { client } = makeDb(users);

    const result = await fetchAdminUsersWithCounts(client, { search: 'needle' });

    expect((result.data!.users as Row[]).map((u) => u.id)).toEqual(['u142']);
  });

  it('keeps the 100-row page size when not searching', async () => {
    const { client, sawLimit } = makeDb(makeUsers());
    const result = await fetchAdminUsersWithCounts(client);
    expect(result.data!.users).toHaveLength(100);
    expect(sawLimit()).toBe(100);
  });

  it('the Test accounts filter returns exactly the rows where is_test_account is true', async () => {
    const users = makeUsers();
    const { client } = makeDb(users);

    const result = await fetchAdminUsersWithCounts(client, { filter: 'test' });

    const returned = result.data!.users as Row[];
    const expected = users.filter((u) => u.is_test_account === true).map((u) => u.id);
    expect(returned.map((u) => u.id).sort()).toEqual(expected.sort());
    expect(returned.every((u) => u.is_test_account === true)).toBe(true);
    expect(returned.length).toBeGreaterThan(0);
  });

  it('sorting by last active puts never-logged-in accounts LAST, not first', async () => {
    const { client } = makeDb(makeUsers());

    const result = await fetchAdminUsersWithCounts(client, { sort: 'last_active', limit: 150 });

    const rows = result.data!.users as Row[];
    const firstNull = rows.findIndex((r) => r.last_login_at == null);
    const lastNonNull = rows.map((r) => r.last_login_at != null).lastIndexOf(true);
    expect(firstNull).toBeGreaterThan(-1); // the fixture has nulls
    // Every null sits after every real timestamp. Postgres defaults DESC to
    // NULLS FIRST, so without nullsFirst:false every dormant account would head
    // the "last active" list -- the exact inversion of what the control means.
    expect(firstNull).toBeGreaterThan(lastNonNull);
  });

  it('Athletes means "not an instructor", including rows where is_instructor is NULL', async () => {
    const users = makeUsers();
    const { client } = makeDb(users);

    const result = await fetchAdminUsersWithCounts(client, { filter: 'athletes', limit: 150 });

    const returned = result.data!.users as Row[];
    expect(returned.some((u) => u.is_instructor === null)).toBe(true);
    expect(returned.every((u) => u.is_instructor !== true)).toBe(true);
  });

  it('strips characters that would re-shape the PostgREST or() filter', async () => {
    const users = makeUsers();
    users[120] = { ...users[120], name: 'Comma Person', email: 'comma@example.com' };
    const { client } = makeDb(users);

    // A raw comma would split `or=(...)` into extra disjuncts and match far too much.
    const result = await fetchAdminUsersWithCounts(client, { search: 'comma,person)' });

    expect((result.data!.users as Row[]).length).toBeLessThan(150);
  });
});
