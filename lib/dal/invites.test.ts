/**
 * RLS-H2: the invite_tokens READERS (fetchInviteTokenForJoin,
 * fetchLatestInviteTokenForSession, fetchInviteWithSession) were removed — they
 * read the raw table and are rerouted to the validate_invite_token /
 * get_invite_token_for_notification definer RPCs. Only insertInviteToken remains
 * (the /api/invites/session route mints the in-app token with a service-role client).
 */
import { describe, it, expect, vi } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { insertInviteToken } from './invites';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function makeMockSupabase(result: { error?: { message: string } | null }) {
  return {
    from: () => ({ insert: () => Promise.resolve({ error: result.error ?? null }) }),
  } as unknown as SupabaseClient;
}

describe('insertInviteToken', () => {
  it('returns success when the insert succeeds', async () => {
    const supabase = makeMockSupabase({});
    const result = await insertInviteToken(supabase, { session_id: 'sess-1', token: 'tok-1', created_by: 'user-1' });
    expect(result.success).toBe(true);
  });

  it('surfaces a Supabase error', async () => {
    const supabase = makeMockSupabase({ error: { message: 'db down' } });
    const result = await insertInviteToken(supabase, { session_id: 'sess-1', token: 'tok-1', created_by: 'user-1' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('db down');
  });
});
