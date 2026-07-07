/**
 * T-INV1: DAL tests for invite token lookups used by the acceptance flow.
 *
 *  - fetchInviteTokenForJoin: join-time validation lookup by token
 *  - fetchLatestInviteTokenForSession: resolves a session_invite
 *    notification tap to the inviter's latest unexpired token
 */
import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetchInviteTokenForJoin, fetchLatestInviteTokenForSession } from './invites';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

/** Chainable builder: every method returns the chain; maybeSingle resolves. */
function makeMockSupabase(result: { data?: unknown; error?: { message: string } | null }) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ['select', 'eq', 'gt', 'order', 'limit']) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  return { from: () => chain } as unknown as SupabaseClient;
}

describe('fetchInviteTokenForJoin', () => {
  it('returns the token row when found', async () => {
    const supabase = makeMockSupabase({ data: { session_id: 'sess-1', expires_at: '2999-01-01T00:00:00Z' } });
    const result = await fetchInviteTokenForJoin(supabase, 'tok-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ session_id: 'sess-1', expires_at: '2999-01-01T00:00:00Z' });
  });

  it('returns null data (not an error) for an unknown token', async () => {
    const supabase = makeMockSupabase({ data: null });
    const result = await fetchInviteTokenForJoin(supabase, 'tok-ghost');
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('surfaces a Supabase error', async () => {
    const supabase = makeMockSupabase({ error: { message: 'db down' } });
    const result = await fetchInviteTokenForJoin(supabase, 'tok-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});

describe('fetchLatestInviteTokenForSession', () => {
  it('returns the latest token when one exists', async () => {
    const supabase = makeMockSupabase({ data: { token: 'tok-latest' } });
    const result = await fetchLatestInviteTokenForSession(supabase, 'sess-1', 'user-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ token: 'tok-latest' });
  });

  it('returns null data when the inviter has no unexpired token', async () => {
    const supabase = makeMockSupabase({ data: null });
    const result = await fetchLatestInviteTokenForSession(supabase, 'sess-1', 'user-1');
    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });

  it('surfaces a Supabase error', async () => {
    const supabase = makeMockSupabase({ error: { message: 'db down' } });
    const result = await fetchLatestInviteTokenForSession(supabase, 'sess-1', 'user-1');
    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});
