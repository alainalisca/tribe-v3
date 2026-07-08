import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { fetchSessionFields, checkExistingParticipation, fetchInviteTokenForJoin } from '@/lib/dal';

interface JoinSessionParams {
  supabase: SupabaseClient;
  sessionId: string;
  userId: string;
  userName: string;
  /**
   * T-INV1: invite link token. Required to join an invite_only session;
   * ignored for open/curated sessions. Tokens are multi-use shareable
   * links that expire 7 days after creation (DB default on invite_tokens).
   */
  inviteToken?: string;
}

interface JoinSessionResult {
  success: boolean;
  status?: 'confirmed' | 'pending';
  error?: string;
}

export async function joinSession({
  supabase,
  sessionId,
  userId,
  userName,
  inviteToken,
}: JoinSessionParams): Promise<JoinSessionResult> {
  try {
    // 1. Fetch the session
    const sessionResult = await fetchSessionFields(
      supabase,
      sessionId,
      'id, creator_id, join_policy, max_participants, current_participants, status, sport, is_paid, price_cents'
    );

    if (!sessionResult.success || !sessionResult.data) {
      return { success: false, error: 'session_not_found' };
    }

    const session = sessionResult.data as {
      id: string;
      creator_id: string;
      join_policy: string;
      max_participants: number;
      current_participants: number;
      status: string;
      sport: string;
      is_paid: boolean | null;
      price_cents: number | null;
    };

    // 2. Check session is active
    if (session.status !== 'active') {
      return { success: false, error: 'session_not_active' };
    }

    // 3. Check self-join
    if (session.creator_id === userId) {
      return { success: false, error: 'self_join' };
    }

    // 4. Check duplicate participation
    const existingResult = await checkExistingParticipation(supabase, sessionId, userId);
    if (existingResult.success && existingResult.data) {
      return { success: false, error: 'already_joined' };
    }

    // 5. Check invite_only (T-INV1). A valid, unexpired token for THIS session
    // unlocks the join; anything else keeps the gate closed. "Already used" is
    // not a token state — tokens are multi-use, and a repeat acceptance is
    // caught by the already_joined check above.
    //
    // These client-side checks give athletes fast, specific feedback, but they
    // are NO LONGER the security boundary: T-SEC1 moved policy enforcement into
    // the join_session RPC, which re-validates the token (and derives the
    // status) server-side. This block short-circuits before the round-trip;
    // the RPC is authoritative if a caller skips it.
    if (session.join_policy === 'invite_only') {
      if (!inviteToken) {
        return { success: false, error: 'invite_only' };
      }
      const inviteResult = await fetchInviteTokenForJoin(supabase, inviteToken);
      if (!inviteResult.success || !inviteResult.data || inviteResult.data.session_id !== sessionId) {
        return { success: false, error: 'invite_invalid' };
      }
      if (inviteResult.data.expires_at && new Date(inviteResult.data.expires_at) < new Date()) {
        return { success: false, error: 'invite_expired' };
      }
    }

    // 6. Atomic join via RPC (T-SEC1: the RPC is the single source of truth for
    // the join status). It reads the session's own join_policy/is_paid inside a
    // row lock, validates the invite token for invite-only sessions, derives the
    // outcome (curated/paid -> pending, else confirmed), enforces capacity, and
    // inserts idempotently — all server-side. The client no longer sends a
    // status; it passes the invite token and trusts the returned status.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('join_session', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_invite_token: inviteToken ?? null,
    });

    if (rpcError) {
      logError(rpcError, { action: 'joinSession.rpc', sessionId, userId });
      return { success: false, error: rpcError.message };
    }

    const rpcData = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
    if (!rpcData?.success) {
      const err = rpcData?.error;
      return {
        success: false,
        error: err === 'Session is full' ? 'capacity_full' : err || 'join_failed',
      };
    }

    // Trust the server-derived status for UX (toast copy) and the host
    // notification kind — not a client guess.
    const status: 'confirmed' | 'pending' = rpcData.status === 'pending' ? 'pending' : 'confirmed';

    // 7. Notify host (fire-and-forget). Goes through the narrow
    // notify-join route, NOT /api/notifications/send directly: that
    // endpoint is internal-only now, and the recipient + message are
    // derived server-side from the session (anti-spoofing).
    fetch('/api/sessions/notify-join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        joiner_name: userName,
        kind: status === 'pending' ? 'request' : 'join',
      }),
    }).catch((err) => logError(err, { action: 'notify_host', sessionId }));

    return { success: true, status };
  } catch (error) {
    logError(error, { action: 'joinSession', userId, sessionId });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
