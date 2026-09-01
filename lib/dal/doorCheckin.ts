/** DAL: host door check-in (migration 153 RPCs) — add / remove walk-in guests. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * Read the jsonb result of the host_* RPCs, which return
 * { success, participant_id?, error? }. PostgREST may hand it back as a parsed
 * object or (rarely) a JSON string, so normalize both, matching the guest-join
 * helper in hooks/sessionActionHelpers.ts.
 */
function parseRpcBody(raw: unknown): { success?: boolean; participant_id?: string; error?: string } {
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? {};
}

/**
 * Add a walk-in guest to a session via host_add_session_guest. Creator/admin
 * scoped and confirmed-on-insert server-side. Phone and email are accepted by the
 * RPC but not collected at the door, so they are omitted here.
 */
export async function addSessionGuest(
  supabase: SupabaseClient,
  sessionId: string,
  guestName: string
): Promise<DalResult<{ participantId: string }>> {
  try {
    const { data, error } = await supabase.rpc('host_add_session_guest', {
      p_session_id: sessionId,
      p_guest_name: guestName,
    });
    if (error) return { success: false, error: error.message };
    const body = parseRpcBody(data);
    if (!body.success || !body.participant_id) {
      return { success: false, error: body.error || 'add_failed' };
    }
    return { success: true, data: { participantId: body.participant_id } };
  } catch (error) {
    logError(error, { action: 'addSessionGuest', sessionId });
    return { success: false, error: 'Failed to add guest' };
  }
}

/**
 * Remove a door-added guest via host_remove_session_guest. Creator/admin scoped;
 * only ever removes guest rows (user_id IS NULL) of this session.
 */
export async function removeSessionGuest(
  supabase: SupabaseClient,
  sessionId: string,
  participantId: string
): Promise<DalResult<null>> {
  try {
    const { data, error } = await supabase.rpc('host_remove_session_guest', {
      p_session_id: sessionId,
      p_participant_id: participantId,
    });
    if (error) return { success: false, error: error.message };
    const body = parseRpcBody(data);
    if (!body.success) return { success: false, error: body.error || 'remove_failed' };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'removeSessionGuest', sessionId, participantId });
    return { success: false, error: 'Failed to remove guest' };
  }
}
