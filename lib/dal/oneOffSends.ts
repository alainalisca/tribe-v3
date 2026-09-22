/** DAL: one_off_sends — send-once bookkeeping for one-off outreach. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type OneOffChannel = 'push' | 'email';
export type OneOffOutcome = 'claimed' | 'sent' | 'failed' | 'suppressed' | 'dry_run';

/**
 * Take the send-once claim for one person on one channel.
 *
 * THE CLAIM IS TAKEN BEFORE THE SEND. The (campaign, user_id, channel) primary
 * key means a second attempt cannot insert, so a re-run cannot message anybody
 * twice -- and that guarantee is held by the database, not by a flag in a
 * script somebody can re-run with a different argument.
 *
 * Returns data:false when the claim was already taken. That is the SKIP
 * signal, and it is not an error: a re-run producing thirty skips is the
 * system working.
 *
 * Ordering matters and the two options fail differently. Recording after the
 * send means a crash in between leaves no row and the re-run sends again.
 * Recording before means a crash leaves a 'claimed' row and the re-run skips.
 * Being missed is recoverable by a human retrying a named row; being messaged
 * twice is not recoverable at all.
 */
export async function claimOneOffSend(
  supabase: SupabaseClient,
  campaign: string,
  userId: string,
  channel: OneOffChannel
): Promise<DalResult<{ claimed: boolean; unsubToken: string | null }>> {
  try {
    // No per-campaign token: migration 189 moved the unsubscribe credential to
    // the person (notification_preferences.unsub_token), so one stable URL
    // works for every email. Minting one here as well would be a second
    // mechanism, and the copy that drifts is the one in somebody's inbox.
    const unsubToken = null;
    const { data, error } = await supabase
      .from('one_off_sends')
      .insert({ campaign, user_id: userId, channel, unsub_token: unsubToken })
      .select('user_id')
      .maybeSingle();

    // 23505 is the unique violation: somebody already holds this claim.
    if (error) {
      if (error.code === '23505') return { success: true, data: { claimed: false, unsubToken: null } };
      return { success: false, error: error.message };
    }
    // A missing row with no error would mean the insert silently did nothing.
    // Reporting that as a claim would let the send proceed unrecorded, which
    // is the exact state the claim exists to prevent.
    if (!data) return { success: false, error: 'claim insert returned no row' };
    return { success: true, data: { claimed: true, unsubToken } };
  } catch (error) {
    logError(error, { action: 'claimOneOffSend', campaign, userId, channel });
    return { success: false, error: 'Failed to claim send' };
  }
}

/** Record how a claimed send turned out. Never gates anything; purely the record. */
export async function recordOneOffOutcome(
  supabase: SupabaseClient,
  campaign: string,
  userId: string,
  channel: OneOffChannel,
  outcome: OneOffOutcome,
  detail?: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('one_off_sends')
      .update({ outcome, detail: detail ?? null })
      .eq('campaign', campaign)
      .eq('user_id', userId)
      .eq('channel', channel);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'recordOneOffOutcome', campaign, userId, channel });
    return { success: false, error: 'Failed to record outcome' };
  }
}

/**
 * Release a claim that was never used, so the person is not silently skipped
 * forever by a send that never happened.
 *
 * Only ever called for a DRY RUN. A real send that fails keeps its claim and
 * its 'failed' outcome: a retry is then a deliberate human act on a named row,
 * not something a re-run does by accident. A dry run, by contrast, sent
 * nothing at all, so leaving the claim behind would mean the real run skips
 * everybody -- which is how a rehearsal quietly becomes the whole campaign.
 */
export async function releaseOneOffClaim(
  supabase: SupabaseClient,
  campaign: string,
  userId: string,
  channel: OneOffChannel
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('one_off_sends')
      .delete()
      .eq('campaign', campaign)
      .eq('user_id', userId)
      .eq('channel', channel);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'releaseOneOffClaim', campaign, userId, channel });
    return { success: false, error: 'Failed to release claim' };
  }
}

/**
 * The email opt-out helpers moved to lib/dal/emailUnsubscribe.ts in migration
 * 189's change, because the weekly recap needs them too and a second copy is
 * the one that goes stale. Re-exported here only so existing importers keep
 * working; new code should import from the module that owns them.
 */
export { isEmailSuppressed, userForUnsubToken, setEmailUnsubscribed } from './emailUnsubscribe';
