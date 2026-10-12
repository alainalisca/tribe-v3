import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const logError = vi.fn();
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a), log: vi.fn() }));

import { fetchNewsletterAudience, firstNameOf } from './newsletterAudience';

interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
}
interface Row {
  id: string;
  name: string | null;
  is_instructor: boolean | null;
}

/**
 * A fake that RECORDS the filters each query applied, so the tests can pin the
 * exclusions (deleted, banned, test) rather than trust that the fake honoured
 * them. A fake that silently ignored a dropped filter would pass either way.
 */
function fakeSupabase(opts: {
  auth: AuthUser[];
  users: Row[];
  suppressed: string[];
  usersError?: string;
  authError?: string;
}) {
  const calls: { table: string; select: string; filters: string[] }[] = [];
  const from = (table: string) => {
    const call = { table, select: '', filters: [] as string[] };
    calls.push(call);
    const q = {
      select(cols: string) {
        call.select = cols;
        return q;
      },
      is(col: string, v: unknown) {
        call.filters.push(`is:${col}:${String(v)}`);
        return q;
      },
      not(col: string, op: string, v: unknown) {
        call.filters.push(`not:${col}:${op}:${String(v)}`);
        return q;
      },
      order() {
        return q;
      },
      async range() {
        if (table === 'users') {
          return opts.usersError
            ? { data: null, error: { message: opts.usersError } }
            : { data: opts.users, error: null };
        }
        return {
          data: opts.suppressed.map((user_id) => ({ user_id, email_unsubscribed_at: '2026-10-01' })),
          error: null,
        };
      },
    };
    return q;
  };
  const listUsers = vi.fn(async () =>
    opts.authError
      ? { data: { users: [] }, error: { message: opts.authError } }
      : { data: { users: opts.auth }, error: null }
  );
  const client = { from, auth: { admin: { listUsers } } } as unknown as SupabaseClient; // a partial Supabase surface; only the three calls above are reachable
  return { client, calls, listUsers };
}

beforeEach(() => vi.clearAllMocks());

describe('fetchNewsletterAudience', () => {
  it('joins confirmed auth addresses to eligible users and flags suppression and role', async () => {
    const { client } = fakeSupabase({
      auth: [
        { id: 'u1', email: 'ana@x.com', email_confirmed_at: '2026-01-01' },
        { id: 'u2', email: 'leo@x.com', email_confirmed_at: '2026-01-01' },
      ],
      users: [
        { id: 'u1', name: 'Ana María Ruiz', is_instructor: false },
        { id: 'u2', name: 'Leo', is_instructor: true },
      ],
      suppressed: ['u2'],
    });
    const res = await fetchNewsletterAudience(client);
    expect(res.success).toBe(true);
    expect(res.data).toEqual([
      { userId: 'u1', email: 'ana@x.com', firstName: 'Ana', role: 'athlete', suppressed: false, eligible: true },
      { userId: 'u2', email: 'leo@x.com', firstName: 'Leo', role: 'instructor', suppressed: true, eligible: true },
    ]);
  });

  it('leaves out anyone whose email is unconfirmed or missing', async () => {
    const { client } = fakeSupabase({
      auth: [
        { id: 'u1', email: 'a@x.com', email_confirmed_at: null },
        { id: 'u2', email_confirmed_at: '2026-01-01' },
        { id: 'u3', email: 'c@x.com', email_confirmed_at: '2026-01-01' },
      ],
      users: [
        { id: 'u1', name: 'A', is_instructor: false },
        { id: 'u2', name: 'B', is_instructor: false },
        { id: 'u3', name: 'C', is_instructor: false },
      ],
      suppressed: [],
    });
    const res = await fetchNewsletterAudience(client);
    expect(res.data?.map((m) => m.userId)).toEqual(['u3']);
  });

  it('asks for exactly the deleted, banned and test exclusions on users, and only opted-out preference rows', async () => {
    const { client, calls } = fakeSupabase({ auth: [], users: [], suppressed: [] });
    await fetchNewsletterAudience(client);
    const users = calls.find((c) => c.table === 'users');
    expect(users?.select).toBe('id, name, is_instructor');
    expect(users?.filters).toEqual(['is:deleted_at:null', 'not:banned:is:true', 'not:is_test_account:is:true']);
    const prefs = calls.find((c) => c.table === 'notification_preferences');
    expect(prefs?.filters).toEqual(['not:email_unsubscribed_at:is:null']);
  });

  it('a failed users read fails the WHOLE fetch, with the reason logged', async () => {
    const { client } = fakeSupabase({
      auth: [{ id: 'u1', email: 'a@x.com', email_confirmed_at: '2026-01-01' }],
      users: [],
      suppressed: [],
      usersError: 'permission denied for column is_instructor',
    });
    const res = await fetchNewsletterAudience(client);
    expect(res.success).toBe(false);
    expect(res.data).toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('permission denied') }),
      expect.objectContaining({ action: 'fetchNewsletterAudience' })
    );
  });

  it('a failed auth read fails the whole fetch too', async () => {
    const { client } = fakeSupabase({
      auth: [],
      users: [{ id: 'u1', name: 'A', is_instructor: false }],
      suppressed: [],
      authError: 'not admin',
    });
    const res = await fetchNewsletterAudience(client);
    expect(res.success).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('not admin') }),
      expect.anything()
    );
  });
});

describe('firstNameOf', () => {
  it('takes the first word, trimmed', () => {
    expect(firstNameOf('  Ana   María ')).toBe('Ana');
  });
  it('is null for an empty or missing name', () => {
    expect(firstNameOf('')).toBeNull();
    expect(firstNameOf('   ')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});
