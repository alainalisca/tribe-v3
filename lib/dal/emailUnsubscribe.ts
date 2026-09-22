/**
 * DAL: the one email opt-out. Every email this app sends goes through here.
 *
 * Before migration 188 there was no unsubscribe route, no List-Unsubscribe
 * header and no suppression table. email_enabled looks like an opt-out and is
 * not one: 037 defaulted it false, 151 backfilled a preferences row for every
 * auth user supplying only user_id, and updateNotificationPreferences rewrites
 * the whole defaults object on any patch. Every false in it is a default.
 *
 * This module is deliberately the ONLY place that answers "may we email this
 * person" and "what is their unsubscribe link". A second copy is the one that
 * goes stale, and here stale means a link in somebody's inbox that no longer
 * turns their email off.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/**
 * HARD SUPPRESSION. Checked before every email regardless of the type's
 * declared policy, including one declared 'required': a receipt can outrank a
 * preference, it does not outrank "stop emailing me".
 *
 * A FAILED READ SUPPRESSES. This is the one place in this codebase where
 * fail-closed is right. shouldSendNotification fails open so a database hiccup
 * cannot silently drop a session reminder; here the cost of being wrong is
 * emailing somebody who asked us not to.
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

/**
 * This person's stable unsubscribe URL, or null.
 *
 * NULL MUST MEAN "DO NOT SEND", not "send without a link". A promotional or
 * recurring email with no way out is the thing this whole mechanism exists to
 * end, and a missing token means 189's backfill did not reach this row.
 */
export async function unsubUrlFor(
  supabase: SupabaseClient,
  userId: string,
  siteUrl: string
): Promise<DalResult<string | null>> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('unsub_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    const token = (data as { unsub_token: string | null } | null)?.unsub_token ?? null;
    return { success: true, data: token ? `${siteUrl}/api/unsubscribe?token=${token}` : null };
  } catch (error) {
    logError(error, { action: 'unsubUrlFor', userId });
    return { success: false, error: 'Failed to read unsubscribe token' };
  }
}

/** The RFC 8058 one-click headers. In the mail client's own chrome, which is
 *  where people look, rather than only in the footer's small print. */
export const unsubHeaders = (unsubUrl: string): Record<string, string> => ({
  'List-Unsubscribe': `<${unsubUrl}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

/** Turn a stable unsubscribe token into the user it belongs to. */
export async function userForUnsubToken(supabase: SupabaseClient, token: string): Promise<DalResult<string | null>> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
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
 * Record the opt-out.
 *
 * The payload is deliberately two keys. PostgREST's ON CONFLICT DO UPDATE sets
 * only the columns supplied, so an existing row keeps every other preference.
 * Spreading DEFAULT_PREFERENCES here -- the shape
 * updateNotificationPreferences uses -- would reset somebody's entire settings
 * page as a side effect of them clicking unsubscribe.
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
