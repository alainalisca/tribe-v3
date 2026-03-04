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

    // 5. Fetch current confirmed count (authoritative, not cached)
    const countResult = await fetchConfirmedCount(supabase, sessionId);
    const confirmedCount = countResult.success
      ? (countResult.data ?? session.current_participants)
      : session.current_participants;

    // 6. Check capacity
    if (confirmedCount >= session.max_participants) {
      return { success: false, error: 'capacity_full' };
    }

    // 7. Check invite_only
    if (session.join_policy === 'invite_only') {
      return { success: false, error: 'invite_only' };
    }

    // 8. Determine status based on join policy
    const status = session.join_policy === 'curated' ? 'pending' : 'confirmed';

    // 9. Insert participant
    const insertResult = await insertParticipant(supabase, {
      session_id: sessionId,
      user_id: userId,
      status,
    });

    if (!insertResult.success) {
      return { success: false, error: insertResult.error };
    }

    // 10. If confirmed, increment participant count
    if (status === 'confirmed') {
      await updateParticipantCount(supabase, sessionId, confirmedCount + 1);
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
