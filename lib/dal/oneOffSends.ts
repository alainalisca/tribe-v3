/** DAL: one_off_sends — send-once bookkeeping for one-off outreach. */
import { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
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
    // 32 hex chars from crypto, not Math.random: this is the credential that
    // lets an unauthenticated link turn someone's email off.
    const unsubToken = channel === 'email' ? randomBytes(16).toString('hex') : null;
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
 * HARD EMAIL SUPPRESSION, checked before every email this campaign sends.
 *
 * email_enabled cannot answer "did this person ask us to stop": 037 defaulted
 * it false, 151 backfilled a row for every user, and
 * updateNotificationPreferences rewrites the whole defaults object on any
 * patch. Every false in it is a default. email_unsubscribed_at (migration 188)
 * is only ever written by someone clicking unsubscribe.
 *
 * A failed read suppresses. This is the one place in this codebase where fail-
 * closed is right: shouldSendNotification fails open so a database hiccup does
 * not silently drop a session reminder, but the cost of being wrong here is
 * emailing somebody who told us not to.
 */
export async function isEmailSuppressed(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('email_unsubscribed_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      logError(new Error(error.message), { action: 'isEmailSuppressed', userId });
      return true;
    }
    // No row means no preferences were ever written, which is not an opt-out.
    return !!data?.email_unsubscribed_at;
  } catch (error) {
    logError(error, { action: 'isEmailSuppressed', userId });
    return true;
  }
}

/** Turn a single-use unsubscribe token into the user it belongs to. */
export async function userForUnsubToken(supabase: SupabaseClient, token: string): Promise<DalResult<string | null>> {
  try {
    const { data, error } = await supabase
      .from('one_off_sends')
      .select('user_id')
      .eq('unsub_token', token)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as { user_id: string } | null)?.user_id ?? null };
  } catch (error) {
    logError(error, { action: 'userForUnsubToken' });
    return { success: false, error: 'Failed to resolve token' };
  }
}

/**
 * Record the opt-out. Upsert, because a user may have no preferences row.
 *
 * The payload is deliberately two keys. PostgREST's ON CONFLICT DO UPDATE sets
 * only the columns supplied, so an existing row keeps every other preference.
 * Passing a spread of defaults here -- the shape updateNotificationPreferences
 * uses -- would reset someone's whole settings page as a side effect of them
 * clicking unsubscribe.
 */
export async function setEmailUnsubscribed(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, email_unsubscribed_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'setEmailUnsubscribed', userId });
    return { success: false, error: 'Failed to unsubscribe' };
  }
}
