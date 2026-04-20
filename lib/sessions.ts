import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { fetchSessionFields, checkExistingParticipation } from '@/lib/dal';

interface JoinSessionParams {
  supabase: SupabaseClient;
  sessionId: string;
  userId: string;
  userName: string;
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
}: JoinSessionParams): Promise<JoinSessionResult> {
  try {
    // 1. Fetch the session
    const sessionResult = await fetchSessionFields(
      supabase,
      sessionId,
      'id, creator_id, join_policy, max_participants, current_participants, status, sport'
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

    // 5. Check invite_only
    if (session.join_policy === 'invite_only') {
      return { success: false, error: 'invite_only' };
    }

    // 6. Determine status based on join policy
    const status = session.join_policy === 'curated' ? 'pending' : 'confirmed';

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
      p_status: status,
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

    // 11. Notify host (fire-and-forget)
    const isRequest = status === 'pending';
    fetch('/api/notifications/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: session.creator_id,
        title: isRequest ? '📩 New Join Request' : '🎉 New Training Partner!',
        body: isRequest
          ? `${userName} wants to join your ${session.sport} session`
          : `${userName} joined your ${session.sport} session`,
        url: `/session/${sessionId}`,
        data: { sessionId, type: 'join' },
      }),
    }).catch((err) => logError(err, { action: 'notify_host', sessionId }));

    return { success: true, status };
  } catch (error) {
    logError(error, { action: 'joinSession', userId, sessionId });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
