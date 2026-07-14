import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { fetchSessionFields, checkExistingParticipation } from '@/lib/dal';

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

    // 5. Check invite_only (T-INV1). A valid, unexpired token for THIS
    // session unlocks the normal join flow below; anything else keeps the
    // gate closed. "Already used" is not a token state — tokens are
    // multi-use, and a repeat acceptance is caught by the already_joined
    // check above.
    // T-SEC1: the join_session RPC now enforces this server-side (validates the
    // token against the session's join_policy), so a direct RPC call can no
    // longer bypass it. This client check stays as a fast pre-check that returns
    // friendly errors before the round-trip; the token is also passed to the RPC
    // below, which is the authoritative gate.
    if (session.join_policy === 'invite_only') {
      if (!inviteToken) {
        return { success: false, error: 'invite_only' };
      }
      // RLS-H2: validate via the definer RPC (no raw invite_tokens read). The RPC
      // checks existence + expiry as owner; join_session server-side is still the
      // authoritative gate (this is a fast, friendly pre-check).
      const { data: inviteRaw, error: inviteError } = await supabase.rpc('validate_invite_token', {
        p_token: inviteToken,
      });
      if (inviteError) return { success: false, error: 'invite_invalid' };
      const invite = (typeof inviteRaw === 'string' ? JSON.parse(inviteRaw) : inviteRaw) as {
        valid: boolean;
        reason?: string;
        session_id?: string;
      } | null;
      if (!invite?.valid) {
        return { success: false, error: invite?.reason === 'expired' ? 'invite_expired' : 'invite_invalid' };
      }
      if (invite.session_id !== sessionId) {
        return { success: false, error: 'invite_invalid' };
      }
    }

    // 6. Determine status based on join policy AND paid state.
    // T-PAY1: paid sessions (price > 0) are off-platform — the athlete pays the
    // instructor directly and the instructor confirms receipt. So joining a paid
    // session always creates a pending request (awaiting payment confirmation),
    // exactly like the curated manual-approval flow. Tribe never touches money.
    const isPaid = !!session.is_paid && (session.price_cents ?? 0) > 0;
    const status = session.join_policy === 'curated' || isPaid ? 'pending' : 'confirmed';

    // 7. Atomic join via RPC.
    // LOGIC-01: the RPC holds a row-level lock on the session, counts confirmed
    // participants, and inserts in one transaction. The previous fallback
    // read count then inserted in two round-trips, which allowed two
    // concurrent joiners to both pass the capacity check.
    // The RPC also keeps sessions.current_participants in sync, so the
    // separate updateParticipantCount call afterwards is no longer needed.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('join_session', {
      p_session_id: sessionId,
      p_user_id: userId,
      // p_status is ignored by the RPC now (status is derived server-side from
      // join_policy); kept for the rolling-deploy window. p_invite_token is the
      // real addition — the RPC validates it server-side for invite_only.
      p_status: status,
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

    // 11. Notify host (fire-and-forget). Goes through the narrow
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
