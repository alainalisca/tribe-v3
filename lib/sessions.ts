import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

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
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, creator_id, join_policy, max_participants, current_participants, status, sport')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return { success: false, error: 'session_not_found' };
    }

    // 2. Check session is active
    if (session.status !== 'active') {
      return { success: false, error: 'session_not_active' };
    }

    // 3. Check self-join
    if (session.creator_id === userId) {
      return { success: false, error: 'self_join' };
    }

    // 4. Check duplicate participation
    const { data: existing } = await supabase
      .from('session_participants')
      .select('id, status')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'already_joined' };
    }

    // 5. Fetch current confirmed count (authoritative, not cached)
    const { count } = await supabase
      .from('session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    const confirmedCount = count ?? session.current_participants;

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
    const { error: insertError } = await supabase
      .from('session_participants')
      .insert({
        session_id: sessionId,
        user_id: userId,
        status,
      });

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    // 10. If confirmed, increment participant count
    if (status === 'confirmed') {
      await supabase
        .from('sessions')
        .update({ current_participants: confirmedCount + 1 })
        .eq('id', sessionId);
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
    }).catch(err => logError(err, { action: 'notify_host', sessionId }));

    return { success: true, status };
  } catch (error) {
    logError(error, { action: 'joinSession', userId, sessionId });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
