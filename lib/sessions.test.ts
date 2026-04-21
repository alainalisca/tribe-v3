import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for lib/sessions.ts:joinSession.
 *
 * Rewritten 2026-04-21 against the post-LOGIC-01 contract: joinSession
 * delegates the capacity check + insert to the join_session RPC
 * (migration 042), which holds a row-level lock on the session and
 * serializes concurrent joins. The pre-RPC client-side fallback is gone.
 *
 * What this file verifies:
 *   1. Pre-RPC validation — session_not_found, session_not_active,
 *      self_join, already_joined, invite_only — each returns the
 *      expected error without calling the RPC.
 *   2. Happy paths for open join (status: confirmed) and curated
 *      join (status: pending) — RPC is called with the right args.
 *   3. RPC-level errors propagate through the caller.
 *   4. RPC returning `{success: false, error: 'Session is full'}` is
 *      translated to the stable 'capacity_full' code.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  fetchSessionFields: vi.fn(),
  checkExistingParticipation: vi.fn(),
}));

import { joinSession } from './sessions';
import { fetchSessionFields, checkExistingParticipation } from '@/lib/dal';

function makeSupabase(rpcResult: { data?: unknown; error?: { message: string } | null } = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: rpcResult.data ?? { success: true, participant_id: 'pp-1' },
    error: rpcResult.error ?? null,
  });
  return { rpc, __rpc: rpc };
}

function session(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sess-1',
    creator_id: 'creator-1',
    join_policy: 'open',
    max_participants: 10,
    current_participants: 3,
    status: 'active',
    sport: 'bjj',
    ...overrides,
  };
}

describe('joinSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Notification is fire-and-forget — tests don't assert on it but we stub.
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
  });

  it('returns session_not_found when fetchSessionFields fails', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({ success: false, error: 'not found' } as never);
    const s = makeSupabase();
    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });
    expect(res).toEqual({ success: false, error: 'session_not_found' });
    expect(s.__rpc).not.toHaveBeenCalled();
  });

  it('returns session_not_active when session.status is cancelled', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: session({ status: 'cancelled' }),
    } as never);
    const s = makeSupabase();
    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });
    expect(res.error).toBe('session_not_active');
    expect(s.__rpc).not.toHaveBeenCalled();
  });

  it('returns self_join when caller is the creator', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: session({ creator_id: 'user-1' }),
    } as never);
    const s = makeSupabase();
    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });
    expect(res.error).toBe('self_join');
    expect(s.__rpc).not.toHaveBeenCalled();
  });

  it('returns already_joined when user already participates', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({ success: true, data: session() } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: true } as never);
    const s = makeSupabase();
    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });
    expect(res.error).toBe('already_joined');
    expect(s.__rpc).not.toHaveBeenCalled();
  });

  it('returns invite_only when join_policy is invite_only', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: session({ join_policy: 'invite_only' }),
    } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase();
    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });
    expect(res.error).toBe('invite_only');
    expect(s.__rpc).not.toHaveBeenCalled();
  });

  it('calls join_session RPC with status=confirmed for open sessions', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({ success: true, data: session() } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ data: { success: true, participant_id: 'pp-1', status: 'confirmed' } });

    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });

    expect(res).toEqual({ success: true, status: 'confirmed' });
    expect(s.__rpc).toHaveBeenCalledWith('join_session', {
      p_session_id: 'sess-1',
      p_user_id: 'user-1',
      p_status: 'confirmed',
    });
  });

  it('calls join_session RPC with status=pending for curated sessions', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: session({ join_policy: 'curated' }),
    } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ data: { success: true, participant_id: 'pp-2', status: 'pending' } });

    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });

    expect(res).toEqual({ success: true, status: 'pending' });
    expect(s.__rpc).toHaveBeenCalledWith('join_session', {
      p_session_id: 'sess-1',
      p_user_id: 'user-1',
      p_status: 'pending',
    });
  });

  it('translates "Session is full" RPC error to capacity_full', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({ success: true, data: session() } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ data: { success: false, error: 'Session is full' } });

    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });

    expect(res).toEqual({ success: false, error: 'capacity_full' });
  });

  it('propagates RPC-level errors', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({ success: true, data: session() } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ error: { message: 'db down' } });

    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });

    expect(res).toEqual({ success: false, error: 'db down' });
  });

  it('accepts a JSON-string rpc result (Supabase sometimes returns text)', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({ success: true, data: session() } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ data: JSON.stringify({ success: true, participant_id: 'pp-3' }) });

    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });

    expect(res).toEqual({ success: true, status: 'confirmed' });
  });
});
