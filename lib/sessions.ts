import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import {
  fetchSessionFields,
  fetchConfirmedCount,
  insertParticipant,
  updateParticipantCount,
  checkExistingParticipation,
} from '@/lib/dal';

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

    // 7. Try atomic join via RPC (handles capacity check + insert in one transaction)
    // TODO: Create join_session RPC in Supabase for atomic capacity check (see lib/dal/rpc/joinSession.sql)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('join_session', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_status: status,
    });

    if (!rpcError && rpcResult) {
      const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      if (!result.success) {
        return { success: false, error: result.error === 'Session is full' ? 'capacity_full' : result.error };
      }
    } else {
      // Fallback: RPC not available yet, use original check-then-insert
      const countResult = await fetchConfirmedCount(supabase, sessionId);
      const confirmedCount = countResult.success
        ? (countResult.data ?? session.current_participants)
        : session.current_participants;

      if (confirmedCount >= session.max_participants) {
        return { success: false, error: 'capacity_full' };
      }

      const insertResult = await insertParticipant(supabase, {
        session_id: sessionId,
        user_id: userId,
        status,
      });

      if (!insertResult.success) {
        return { success: false, error: insertResult.error };
      }
    }

    // 8. Update cached participant count
    const countAfter = await fetchConfirmedCount(supabase, sessionId);
    if (countAfter.success && countAfter.data !== undefined) {
      await updateParticipantCount(supabase, sessionId, countAfter.data);
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
