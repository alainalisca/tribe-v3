import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { lookupInviterFirstName, firstNameOf, REFERRAL_CODE_SHAPE } from './referralInviter';

interface Row {
  data: unknown;
  error: { message: string } | null;
}

/** A tiny fake: one queued answer per .from() call, and a record of every table asked. */
function fakeAdmin(answers: Record<string, Row>) {
  const tables: string[] = [];
  const selects: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      const chain = {
        select(cols: string) {
          selects.push(`${table}:${cols}`);
          return chain;
        },
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve(answers[table]),
      };
      return chain;
    },
  };
  return { admin: client as unknown as SupabaseClient, tables, selects };
}

const CODE = 'TRIBE-AB2CD';

describe('lookupInviterFirstName', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ONLY the first name of the code owner', async () => {
    const { admin, selects } = fakeAdmin({
      referrals: { data: { referrer_id: 'u1' }, error: null },
      users: { data: { name: '  Ana Carolina Tapasco ', banned: false, deleted_at: null }, error: null },
    });
    expect(await lookupInviterFirstName(admin, CODE)).toEqual({ success: true, data: 'Ana' });
    // Pinned so a wider select (email, avatar) shows up as a test change.
    expect(selects).toEqual(['referrals:referrer_id', 'users:name, banned, deleted_at']);
  });

  it('refuses a malformed code before any query runs', async () => {
    for (const bad of ['tribe-ab2cd', 'TRIBE-ABCD', 'TRIBE-AB2CDE', 'D637N8', "TRIBE-AB2C'", 'TRIBE-OI0O1']) {
      const { admin, tables } = fakeAdmin({});
      expect(await lookupInviterFirstName(admin, bad)).toEqual({ success: true, data: null });
      expect(tables, bad).toEqual([]);
    }
  });

  it('answers null, not an error, for a code nobody owns', async () => {
    const { admin, tables } = fakeAdmin({ referrals: { data: null, error: null } });
    expect(await lookupInviterFirstName(admin, CODE)).toEqual({ success: true, data: null });
    expect(tables).toEqual(['referrals']);
  });

  it('gives no name for a deleted or banned owner', async () => {
    for (const user of [
      { name: 'Zed', banned: true, deleted_at: null },
      { name: 'Zed', banned: false, deleted_at: '2026-10-01' },
      null,
    ]) {
      const { admin } = fakeAdmin({
        referrals: { data: { referrer_id: 'u1' }, error: null },
        users: { data: user, error: null },
      });
      expect(await lookupInviterFirstName(admin, CODE)).toEqual({ success: true, data: null });
    }
  });

  it('reports a database error as a failure, carrying the reason', async () => {
    const { admin } = fakeAdmin({ referrals: { data: null, error: { message: 'boom' } } });
    expect(await lookupInviterFirstName(admin, CODE)).toEqual({ success: false, error: 'boom' });
  });
});

describe('firstNameOf', () => {
  it('takes the first word, trimmed, capped at 40 characters', () => {
    expect(firstNameOf('Leo Garcia')).toBe('Leo');
    expect(firstNameOf('   ')).toBeNull();
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf('x'.repeat(60))).toHaveLength(40);
  });
});

describe('REFERRAL_CODE_SHAPE', () => {
  it('matches what referrals.generateCode() produces (no I, O, 0, 1)', () => {
    expect(REFERRAL_CODE_SHAPE.test('TRIBE-HJK23')).toBe(true);
    expect(REFERRAL_CODE_SHAPE.test('TRIBE-HJKI3')).toBe(false);
  });
});
