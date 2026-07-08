import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for lib/sessions.ts:joinSession.
 *
 * Rewritten 2026-04-21 against the post-LOGIC-01 contract: joinSession
 * delegates the capacity check + insert to the join_session RPC
 * (migration 042), which holds a row-level lock on the session and
 * serializes concurrent joins. The pre-RPC client-side fallback is gone.
 *
 * T-SEC1 (2026-07-07): the RPC is now the single authority on the join
 * status. joinSession no longer sends a client-derived p_status; it sends
 * p_invite_token (the token or null) and TRUSTS the status the RPC returns.
 * The client-side policy checks remain only for fast UX feedback, not as the
 * security boundary.
 *
 * What this file verifies:
 *   1. Pre-RPC validation — session_not_found, session_not_active,
 *      self_join, already_joined, invite_only — each returns the
 *      expected error without calling the RPC.
 *   2. The RPC is called with p_invite_token (never p_status), and the
 *      returned status is what joinSession reports back.
 *   3. RPC-level errors propagate through the caller.
 *   4. RPC returning `{success: false, error: 'Session is full'}` is
 *      translated to the stable 'capacity_full' code.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  fetchSessionFields: vi.fn(),
  checkExistingParticipation: vi.fn(),
  fetchInviteTokenForJoin: vi.fn(),
}));

import { joinSession } from './sessions';
import { fetchSessionFields, checkExistingParticipation, fetchInviteTokenForJoin } from '@/lib/dal';

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

  // T-INV1: invite tokens unlock the invite_only gate; everything else
  // (capacity, duplicates, paid status) still goes through the normal flow.
  describe('invite_only with inviteToken', () => {
    beforeEach(() => {
      vi.mocked(fetchSessionFields).mockResolvedValue({
        success: true,
        data: session({ join_policy: 'invite_only' }),
      } as never);
      vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    });

    function invite(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        success: true,
        data: { session_id: 'sess-1', expires_at: '2999-01-01T00:00:00Z', ...overrides },
      };
    }

    it('joins (status=confirmed) with a valid unexpired token for this session', async () => {
      vi.mocked(fetchInviteTokenForJoin).mockResolvedValue(invite() as never);
      const s = makeSupabase({ data: { success: true, participant_id: 'pp-1', status: 'confirmed' } });
      const res = await joinSession({
        supabase: s as never,
        sessionId: 'sess-1',
        userId: 'user-1',
        userName: 'Al',
        inviteToken: 'tok-valid',
      });
      expect(res).toEqual({ success: true, status: 'confirmed' });
      // T-SEC1: the client sends the token, NOT a status — the RPC derives it.
      expect(s.__rpc).toHaveBeenCalledWith('join_session', {
        p_session_id: 'sess-1',
        p_user_id: 'user-1',
        p_invite_token: 'tok-valid',
      });
    });

    it('returns invite_expired for an expired token and does not call the RPC', async () => {
      vi.mocked(fetchInviteTokenForJoin).mockResolvedValue(invite({ expires_at: '2020-01-01T00:00:00Z' }) as never);
      const s = makeSupabase();
      const res = await joinSession({
        supabase: s as never,
        sessionId: 'sess-1',
        userId: 'user-1',
        userName: 'Al',
        inviteToken: 'tok-old',
      });
      expect(res.error).toBe('invite_expired');
      expect(s.__rpc).not.toHaveBeenCalled();
    });

    it('returns invite_invalid for an unknown token', async () => {
      vi.mocked(fetchInviteTokenForJoin).mockResolvedValue({ success: true, data: null } as never);
      const s = makeSupabase();
      const res = await joinSession({
        supabase: s as never,
        sessionId: 'sess-1',
        userId: 'user-1',
        userName: 'Al',
        inviteToken: 'tok-ghost',
      });
      expect(res.error).toBe('invite_invalid');
      expect(s.__rpc).not.toHaveBeenCalled();
    });

    it('returns invite_invalid for a token minted for a DIFFERENT session', async () => {
      vi.mocked(fetchInviteTokenForJoin).mockResolvedValue(invite({ session_id: 'sess-other' }) as never);
      const s = makeSupabase();
      const res = await joinSession({
        supabase: s as never,
        sessionId: 'sess-1',
        userId: 'user-1',
        userName: 'Al',
        inviteToken: 'tok-wrong-session',
      });
      expect(res.error).toBe('invite_invalid');
      expect(s.__rpc).not.toHaveBeenCalled();
    });

    it('returns invite_invalid when the token lookup itself fails', async () => {
      vi.mocked(fetchInviteTokenForJoin).mockResolvedValue({ success: false, error: 'db down' } as never);
      const s = makeSupabase();
      const res = await joinSession({
        supabase: s as never,
        sessionId: 'sess-1',
        userId: 'user-1',
        userName: 'Al',
        inviteToken: 'tok-any',
      });
      expect(res.error).toBe('invite_invalid');
      expect(s.__rpc).not.toHaveBeenCalled();
    });

    it('paid invite_only session with valid token still goes pending (T-PAY1 interplay)', async () => {
      vi.mocked(fetchSessionFields).mockResolvedValue({
        success: true,
        data: session({ join_policy: 'invite_only', is_paid: true, price_cents: 2_000_000 }),
      } as never);
      vi.mocked(fetchInviteTokenForJoin).mockResolvedValue(invite() as never);
      // The RPC derives pending for a paid session; the client returns it.
      const s = makeSupabase({ data: { success: true, participant_id: 'pp-2', status: 'pending' } });
      const res = await joinSession({
        supabase: s as never,
        sessionId: 'sess-1',
        userId: 'user-1',
        userName: 'Al',
        inviteToken: 'tok-valid',
      });
      expect(res).toEqual({ success: true, status: 'pending' });
      expect(s.__rpc).toHaveBeenCalledWith('join_session', {
        p_session_id: 'sess-1',
        p_user_id: 'user-1',
        p_invite_token: 'tok-valid',
      });
    });

    it('already_joined wins over token validation (multi-use token, repeat accept)', async () => {
      vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: true } as never);
      const s = makeSupabase();
      const res = await joinSession({
        supabase: s as never,
        sessionId: 'sess-1',
        userId: 'user-1',
        userName: 'Al',
        inviteToken: 'tok-valid',
      });
      expect(res.error).toBe('already_joined');
      expect(fetchInviteTokenForJoin).not.toHaveBeenCalled();
      expect(s.__rpc).not.toHaveBeenCalled();
    });
  });

  // T-SEC1: the client passes no status and no token for a plain open join;
  // it trusts the RPC's returned status (server-derived confirmed).
  it('calls the RPC with a null token for open sessions and returns the RPC status', async () => {
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
      p_invite_token: null,
    });
  });

  // T-SEC1: the RPC forces curated to pending server-side; the client returns
  // whatever the RPC reports, not a client guess.
  it('returns pending for curated sessions from the RPC status', async () => {
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
      p_invite_token: null,
    });
  });

  // T-PAY1 x T-SEC1: the RPC forces paid (price > 0) to pending server-side.
  it('returns pending for PAID sessions (open policy) from the RPC status', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: session({ join_policy: 'open', is_paid: true, price_cents: 2_000_000 }),
    } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ data: { success: true, participant_id: 'pp-paid', status: 'pending' } });

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
      p_invite_token: null,
    });
  });

  // The client trusts the server: an open, price-0 session confirms because the
  // RPC returns confirmed.
  it('returns confirmed for an open session flagged paid but priced 0', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({
      success: true,
      data: session({ join_policy: 'open', is_paid: true, price_cents: 0 }),
    } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ data: { success: true, status: 'confirmed' } });

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
      p_invite_token: null,
    });
  });

  // T-SEC1: security-relevant — the client must NOT override the RPC's
  // authoritative status. An open session where the RPC (correctly, per real
  // server policy) returns pending must surface as pending, not confirmed.
  it('trusts the RPC status over any client-side expectation', async () => {
    vi.mocked(fetchSessionFields).mockResolvedValue({ success: true, data: session() } as never);
    vi.mocked(checkExistingParticipation).mockResolvedValue({ success: true, data: false } as never);
    const s = makeSupabase({ data: { success: true, participant_id: 'pp-x', status: 'pending' } });

    const res = await joinSession({
      supabase: s as never,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });

    expect(res).toEqual({ success: true, status: 'pending' });
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
