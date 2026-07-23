/**
 * Tests for the authenticated password-change flow.
 *
 * The security property under test: supabase.auth.updateUser({ password })
 * accepts any valid session and does NOT verify the old password, so the flow
 * must prove knowledge of the current password FIRST. A regression here would
 * let anyone with an unlocked phone take over the account, so these assert the
 * call ORDER, not just the return value.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { changePassword, validatePasswordChange, getPasswordProvider, MIN_PASSWORD_LENGTH } from './passwordChange';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

interface MockOpts {
  signInError?: { message: string } | null;
  updateError?: { message: string } | null;
  signOutError?: { message: string } | null;
}

/** Records the order of auth calls so we can assert verify-before-update. */
function buildSupabase(opts: MockOpts = {}) {
  const calls: string[] = [];
  const signOutArgs: unknown[] = [];
  const client = {
    auth: {
      signInWithPassword: vi.fn(async () => {
        calls.push('signInWithPassword');
        return { data: {}, error: opts.signInError ?? null };
      }),
      updateUser: vi.fn(async () => {
        calls.push('updateUser');
        return { data: {}, error: opts.updateError ?? null };
      }),
      signOut: vi.fn(async (args: unknown) => {
        calls.push('signOut');
        signOutArgs.push(args);
        return { error: opts.signOutError ?? null };
      }),
    },
  } as unknown as SupabaseClient;
  return { client, calls, signOutArgs };
}

beforeEach(() => vi.clearAllMocks());

describe('validatePasswordChange', () => {
  it('rejects a new/confirm mismatch', () => {
    expect(validatePasswordChange('oldpass1', 'newpass123', 'newpass124')).toBe('mismatch');
  });

  it('rejects a password shorter than the minimum', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validatePasswordChange('oldpass1', short, short)).toBe('too_short');
  });

  it('rejects reusing the current password', () => {
    expect(validatePasswordChange('samepass123', 'samepass123', 'samepass123')).toBe('same_as_current');
  });

  it('accepts a valid change', () => {
    expect(validatePasswordChange('oldpass1', 'newpass123', 'newpass123')).toBeNull();
  });
});

describe('changePassword', () => {
  it('WRONG CURRENT PASSWORD: returns current_wrong and never updates', async () => {
    const { client, calls } = buildSupabase({ signInError: { message: 'Invalid login credentials' } });

    const result = await changePassword(client, 'a@example.com', 'wrongpass', 'newpass123', 'newpass123');

    expect(result).toEqual({ success: false, error: 'current_wrong' });
    // The security assertion: the update must NOT have been attempted.
    expect(calls).toEqual(['signInWithPassword']);
    expect(client.auth.updateUser).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it('MISMATCH: fails before any network call', async () => {
    const { client, calls } = buildSupabase();

    const result = await changePassword(client, 'a@example.com', 'oldpass1', 'newpass123', 'different123');

    expect(result).toEqual({ success: false, error: 'mismatch' });
    expect(calls).toEqual([]);
  });

  it('WEAK PASSWORD: fails before any network call', async () => {
    const { client, calls } = buildSupabase();
    const short = 'short1';

    const result = await changePassword(client, 'a@example.com', 'oldpass1', short, short);

    expect(result).toEqual({ success: false, error: 'too_short' });
    expect(calls).toEqual([]);
  });

  it('SUCCESS: verifies, updates, then revokes other sessions in that order', async () => {
    const { client, calls, signOutArgs } = buildSupabase();

    const result = await changePassword(client, 'a@example.com', 'oldpass1', 'newpass123', 'newpass123');

    expect(result).toEqual({ success: true });
    expect(calls).toEqual(['signInWithPassword', 'updateUser', 'signOut']);
    // scope 'others' keeps THIS session alive while killing the rest.
    expect(signOutArgs).toEqual([{ scope: 'others' }]);
  });

  it('succeeds even if revoking other sessions fails: the password already changed', async () => {
    const { client } = buildSupabase({ signOutError: { message: 'network' } });

    const result = await changePassword(client, 'a@example.com', 'oldpass1', 'newpass123', 'newpass123');

    // Reporting an error here would wrongly imply the password was unchanged.
    expect(result).toEqual({ success: true });
  });

  it('returns generic when the update itself fails', async () => {
    const { client, calls } = buildSupabase({ updateError: { message: 'weak password' } });

    const result = await changePassword(client, 'a@example.com', 'oldpass1', 'newpass123', 'newpass123');

    expect(result).toEqual({ success: false, error: 'generic' });
    expect(calls).toEqual(['signInWithPassword', 'updateUser']);
  });

  it('returns no_email when the session carries no email', async () => {
    const { client, calls } = buildSupabase();

    const result = await changePassword(client, undefined, 'oldpass1', 'newpass123', 'newpass123');

    expect(result).toEqual({ success: false, error: 'no_email' });
    expect(calls).toEqual([]);
  });
});

describe('getPasswordProvider — OAuth users have no Tribe password', () => {
  it('classifies an email account as changeable', () => {
    expect(getPasswordProvider('email')).toBe('email');
  });

  it('classifies apple and google as provider-managed', () => {
    expect(getPasswordProvider('apple')).toBe('apple');
    expect(getPasswordProvider('google')).toBe('google');
  });

  it('falls back to other for an unknown or missing provider', () => {
    expect(getPasswordProvider('azure')).toBe('other');
    expect(getPasswordProvider(undefined)).toBe('other');
  });
});
