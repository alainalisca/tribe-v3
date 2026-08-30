/** DAL: notification_preferences — per-user delivery controls. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface NotificationPreferences {
  user_id: string;
  session_reminders: boolean;
  session_updates: boolean;
  social_activity: boolean;
  messages: boolean;
  training_nudges: boolean;
  instructor_updates: boolean;
  challenges: boolean;
  marketing: boolean;
  weekly_recap: boolean;
  proximity_alerts: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
}

export const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'user_id'> = {
  session_reminders: true,
  session_updates: true,
  social_activity: true,
  messages: true,
  training_nudges: true,
  instructor_updates: true,
  challenges: true,
  marketing: false,
  weekly_recap: true,
  proximity_alerts: true,
  push_enabled: true,
  email_enabled: false,
};

/** The preference flag a notification type is gated by (one of the category
 *  columns, never a master toggle). */
export type NotificationCategory = keyof Omit<NotificationPreferences, 'user_id' | 'push_enabled' | 'email_enabled'>;

/**
 * Per-channel delivery policy. It answers two questions that "transactional vs
 * marketing" collapsed into one: do we need consent to send, AND has the user
 * told us to stop. Those are separate, and the policy is per type AND channel.
 *
 *   required   - always sends; nothing suppresses it (a receipt). No prefs read.
 *   default_on - sends unless the user turned off its category. On push it also
 *                respects push_enabled (the device master). On email it does
 *                NOT read email_enabled, because email_enabled is a consent
 *                record, not a hard master.
 *   opt_in     - sends only with affirmative channel consent (push_enabled or
 *                email_enabled) AND the category on.
 */
export type DeliveryPolicy = 'required' | 'default_on' | 'opt_in';

export interface NotificationTypeMeta {
  /** The preference toggle this type honors, or null for a type with no user
   *  control (a receipt). */
  category: NotificationCategory | null;
  /** Both channels are required, so a new type cannot be added without deciding
   *  its policy on each. */
  push: DeliveryPolicy;
  email: DeliveryPolicy;
}

/**
 * Notification type → per-channel delivery policy.
 *
 * `category` is the toggle the type honors (null for a receipt with no toggle).
 * `push` / `email` are how each channel gates. See DeliveryPolicy.
 *
 * Consumed by shouldSendNotification and filterPushRecipients. The gating
 * invariant test cross-checks this map against the settings UI category list.
 */
export const TYPE_META: Record<string, NotificationTypeMeta> = {
  // Session lifecycle: honor the category on both channels, no consent needed.
  session_reminder: { category: 'session_reminders', push: 'default_on', email: 'default_on' },
  session_update: { category: 'session_updates', push: 'default_on', email: 'default_on' },
  session_join: { category: 'session_updates', push: 'default_on', email: 'default_on' },
  series_occurrences_generated: { category: 'session_updates', push: 'default_on', email: 'default_on' },
  waitlist_offered: { category: 'session_updates', push: 'default_on', email: 'default_on' },
  waitlist_expired: { category: 'session_updates', push: 'default_on', email: 'default_on' },
  // Social activity directed at the user.
  follow: { category: 'social_activity', push: 'default_on', email: 'default_on' },
  like: { category: 'social_activity', push: 'default_on', email: 'default_on' },
  comment: { category: 'social_activity', push: 'default_on', email: 'default_on' },
  connection_request: { category: 'social_activity', push: 'default_on', email: 'default_on' },
  // Messages: default_on both, so the Messages toggle works on both channels.
  new_message: { category: 'messages', push: 'default_on', email: 'default_on' },
  dm: { category: 'messages', push: 'default_on', email: 'default_on' },
  training_interest: { category: 'messages', push: 'default_on', email: 'default_on' },
  // Instructor updates to followers (following is the consent; category still off-switches).
  instructor_new_session: { category: 'instructor_updates', push: 'default_on', email: 'default_on' },
  instructor_post: { category: 'instructor_updates', push: 'default_on', email: 'default_on' },
  // Challenges.
  challenge_complete: { category: 'challenges', push: 'default_on', email: 'default_on' },
  challenge_join: { category: 'challenges', push: 'default_on', email: 'default_on' },
  // spotlight_selected / referral_complete sit under the marketing category
  // (default off), so under default_on they only fire once the user enables
  // Marketing. FLAGGED for review: these are positive notices, not promos.
  spotlight_selected: { category: 'marketing', push: 'default_on', email: 'default_on' },
  referral_complete: { category: 'marketing', push: 'default_on', email: 'default_on' },
  // Engagement / retention: fine on push (default_on), email needs opt-in.
  habit_session: { category: 'training_nudges', push: 'default_on', email: 'opt_in' },
  streak_risk: { category: 'training_nudges', push: 'default_on', email: 'opt_in' },
  streak_milestone: { category: 'training_nudges', push: 'default_on', email: 'opt_in' },
  comeback: { category: 'training_nudges', push: 'default_on', email: 'opt_in' },
  review_reminder: { category: 'training_nudges', push: 'default_on', email: 'opt_in' },
  general: { category: 'marketing', push: 'default_on', email: 'opt_in' },
  weekly_recap: { category: 'weekly_recap', push: 'default_on', email: 'opt_in' },
  nearby: { category: 'proximity_alerts', push: 'default_on', email: 'opt_in' },
  // Receipts: no user toggle (category null), email is required (always sent).
  // The four notifyAfterFinalize payment sends plus the guest booking and
  // welcome emails. Their callers are not wired to pass these types yet.
  tip_received: { category: null, push: 'default_on', email: 'required' },
  booking_confirmed: { category: null, push: 'default_on', email: 'required' },
  purchase_confirmed: { category: null, push: 'default_on', email: 'required' },
  new_sale: { category: null, push: 'default_on', email: 'required' },
  // Email-only receipts. push is nominal (no push send exists); required is the
  // receipt default it would take if ever pushed.
  guest_confirmation: { category: null, push: 'required', email: 'required' },
  welcome: { category: null, push: 'required', email: 'required' },
};

/** Fetch preferences; returns defaults if no row exists. */
export async function getNotificationPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<NotificationPreferences>> {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };

    if (!data) {
      return { success: true, data: { user_id: userId, ...DEFAULT_PREFERENCES } };
    }
    return { success: true, data: data as NotificationPreferences };
  } catch (error) {
    logError(error, { action: 'getNotificationPreferences', userId });
    return { success: false, error: 'Failed to fetch preferences' };
  }
}

/** Upsert preferences. Partial patch. */
export async function updateNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
  prefs: Partial<Omit<NotificationPreferences, 'user_id'>>
): Promise<DalResult<void>> {
  try {
    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, ...DEFAULT_PREFERENCES, ...prefs }, { onConflict: 'user_id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateNotificationPreferences', userId });
    return { success: false, error: 'Failed to update preferences' };
  }
}

/**
 * Decide whether a notification of `type` should be delivered via `channel` to
 * `userId`, honoring the type's per-channel DeliveryPolicy (TYPE_META):
 *
 *   in_app                 -> always true (never gated).
 *   required               -> always true, no preferences read at all.
 *   default_on, push       -> require push_enabled, then the category if any.
 *   default_on, email      -> ignore email_enabled, require the category if any.
 *   opt_in                 -> require the channel master (push_enabled/
 *                             email_enabled) AND the category.
 *
 * email_enabled is a consent record read ONLY by opt_in. push_enabled stays a
 * device-level master for default_on and opt_in.
 */
export async function shouldSendNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationType: string,
  channel: 'push' | 'email' | 'in_app'
): Promise<boolean> {
  if (channel === 'in_app') return true; // in-app is never gated

  const meta = TYPE_META[notificationType];
  // Unmapped type: treated as default_on with no category. On push that means
  // "respect push_enabled, no category gate"; on email "ignore email_enabled,
  // no category gate" -> allow unless the push master is off. This preserves the
  // historical fail-open behavior (allow rather than silently drop).
  const policy: DeliveryPolicy = meta ? meta[channel] : 'default_on';
  const category = meta ? meta.category : null;

  // required never reads preferences: a receipt cannot be suppressed.
  if (policy === 'required') return true;

  const res = await getNotificationPreferences(supabase, userId);
  if (!res.success || !res.data) return true; // fail open — never drop silently
  const prefs = res.data;

  // Channel masters. push_enabled gates default_on and opt_in on push;
  // email_enabled gates ONLY opt_in on email (it is a consent record, not a
  // hard master, so default_on email ignores it).
  if (channel === 'push' && !prefs.push_enabled) return false;
  if (channel === 'email' && policy === 'opt_in' && !prefs.email_enabled) return false;

  // Category gate: consulted by default_on and opt_in when the type has one.
  if (!category) return true;
  return !!prefs[category];
}

/**
 * Batched PUSH variant of shouldSendNotification for a list of recipients.
 * Returns the subset of `userIds` allowed to receive a PUSH of
 * `notificationType`, resolved in ONE query against notification_preferences
 * (never one call per recipient, which would be an N+1 on a batch send).
 *
 * Matches shouldSendNotification(..., 'push') exactly per user:
 *   - required            -> everyone allowed, no preferences read;
 *   - default_on / opt_in -> both require push_enabled (the device master),
 *     then the category flag when the type has one (email_enabled never applies
 *     on push, so default_on and opt_in are identical here);
 *   - an unmapped type is default_on with no category: push_enabled only;
 *   - a user with no preference row falls back to DEFAULT_PREFERENCES;
 *   - any query error fails OPEN (all userIds allowed), so a preferences lookup
 *     problem never silently drops a send.
 */
export async function filterPushRecipients(
  supabase: SupabaseClient,
  userIds: string[],
  notificationType: string
): Promise<Set<string>> {
  const allowAll = new Set<string>(userIds);
  if (userIds.length === 0) return allowAll;

  const meta = TYPE_META[notificationType];
  // Unmapped type: default_on with no category (see shouldSendNotification), so
  // it respects push_enabled but requires no flag.
  const policy: DeliveryPolicy = meta ? meta.push : 'default_on';
  const category = meta ? meta.category : null;

  // required never suppresses, not even for push_enabled.
  if (policy === 'required') return allowAll;

  try {
    // `category` is a controlled column name from TYPE_META, not caller input,
    // so this interpolation is safe. Only fetch the category column when needed.
    const columns = category ? `user_id, push_enabled, ${category}` : 'user_id, push_enabled';
    const { data, error } = await supabase.from('notification_preferences').select(columns).in('user_id', userIds);
    if (error) return allowAll; // fail open, never drop silently

    const byId = new Map<string, Record<string, unknown>>();
    // `select(columns)` takes a runtime-built string, so PostgREST cannot infer
    // the row type and widens `data` to its error type. Go through `unknown` to
    // the real row shape. This is a typing workaround, not a phantom-field cast:
    // every field read below (user_id, push_enabled, the category) is a real
    // selected column.
    for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      byId.set(row.user_id as string, row);
    }

    const allowed = new Set<string>();
    for (const id of userIds) {
      const row = byId.get(id);
      const pushEnabled = row
        ? ((row.push_enabled as boolean | null) ?? DEFAULT_PREFERENCES.push_enabled)
        : DEFAULT_PREFERENCES.push_enabled;
      if (!pushEnabled) continue; // device master off drops default_on and opt_in

      // No category (receipt or unmapped): push_enabled alone decides.
      if (!category) {
        allowed.add(id);
        continue;
      }

      // Category present: the flag must also be on.
      const categoryFlag = row
        ? ((row[category] as boolean | null) ?? DEFAULT_PREFERENCES[category])
        : DEFAULT_PREFERENCES[category];
      if (categoryFlag) allowed.add(id);
    }
    return allowed;
  } catch (error) {
    logError(error, { action: 'filterPushRecipients', notificationType });
    return allowAll; // fail open
  }
}
