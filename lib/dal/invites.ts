/** DAL: invite_tokens table */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

// RLS-H2: fetchInviteWithSession, fetchInviteTokenForJoin, and
// fetchLatestInviteTokenForSession were deleted here. All three read the raw
// invite_tokens table (which Gate 3 makes unreadable to anon/authenticated) and
// were rerouted onto definer RPCs: validate_invite_token (acceptance page + join
// pre-check) and get_invite_token_for_notification (notification tap). Leaving dead
// raw readers around is a trap — someone rewires one and reopens the scrape hole —
// so they are removed, same as the T-SEC1 insertParticipant helpers.
//
// insertInviteToken is KEPT: the /api/invites/session route still uses it with a
// service-role client (RLS-bypassing) to mint the in-app invite token. The
// shareable-link path now mints server-side via the create_session_invite RPC.
export async function insertInviteToken(
  supabase: SupabaseClient,
  data: Record<string, unknown>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('invite_tokens').insert(data);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'insertInviteToken' });
    return { success: false, error: 'Failed to create invite' };
  }
}
