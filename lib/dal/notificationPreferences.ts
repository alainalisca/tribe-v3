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
 * Delivery class, orthogonal to category. TRANSACTIONAL sends are a direct
 * consequence of an action toward the recipient (receipts, confirmations,
 * directed social events, reminders for things they committed to) and must not
 * be blocked by opt-in state. MARKETING sends are proactive retention/growth
 * and always require an affirmative opt-in.
 */
export type NotificationClass = 'transactional' | 'marketing';

export interface NotificationTypeMeta {
  category: NotificationCategory;
  /** Required, so a new type cannot be added without deciding its class. */
  class: NotificationClass;
}

/**
 * Notification type → { category, class }. `category` selects WHICH preference
 * flag gates the send; `class` governs HOW gating applies once consumers read
 * it (a later W2 C1 step). This step is ADDITIVE ONLY: no code reads `class`
 * yet. shouldSendNotification and filterPushRecipients still consume
 * TYPE_CATEGORY, which is derived from this map below so every existing caller
 * behaves exactly as before.
 *
 * Classes marked FLAG are not covered by the explicit W2 classification and are
 * assigned a defensible default here only because `class` is required; they are
 * safe to override later.
 */
export const TYPE_META: Record<string, NotificationTypeMeta> = {
  session_reminder: { category: 'session_reminders', class: 'transactional' },
  session_update: { category: 'session_updates', class: 'transactional' },
  session_join: { category: 'session_updates', class: 'transactional' },
  series_occurrences_generated: { category: 'session_updates', class: 'transactional' },
  follow: { category: 'social_activity', class: 'transactional' },
  like: { category: 'social_activity', class: 'transactional' },
  comment: { category: 'social_activity', class: 'transactional' },
  connection_request: { category: 'social_activity', class: 'transactional' },
  new_message: { category: 'messages', class: 'transactional' },
  dm: { category: 'messages', class: 'transactional' },
  habit_session: { category: 'training_nudges', class: 'marketing' },
  streak_risk: { category: 'training_nudges', class: 'marketing' },
  streak_milestone: { category: 'training_nudges', class: 'marketing' },
  comeback: { category: 'training_nudges', class: 'marketing' },
  review_reminder: { category: 'training_nudges', class: 'marketing' },
  instructor_new_session: { category: 'instructor_updates', class: 'marketing' }, // FLAG
  instructor_post: { category: 'instructor_updates', class: 'marketing' }, // FLAG
  challenge_complete: { category: 'challenges', class: 'transactional' }, // FLAG
  challenge_join: { category: 'challenges', class: 'transactional' }, // FLAG
  spotlight_selected: { category: 'marketing', class: 'transactional' },
  referral_complete: { category: 'marketing', class: 'transactional' }, // FLAG
  general: { category: 'marketing', class: 'marketing' },
  weekly_recap: { category: 'weekly_recap', class: 'marketing' },
  waitlist_offered: { category: 'session_updates', class: 'transactional' },
  waitlist_expired: { category: 'session_updates', class: 'transactional' },
  training_interest: { category: 'messages', class: 'transactional' },
  tip_received: { category: 'messages', class: 'transactional' },
  nearby: { category: 'proximity_alerts', class: 'marketing' },
};

/**
 * Back-compat: notification type → category, derived from TYPE_META so the
 * existing consumers (shouldSendNotification, filterPushRecipients) keep working
 * unchanged. Do not hand-edit; add entries to TYPE_META.
 */
export const TYPE_CATEGORY: Record<string, NotificationCategory> = Object.fromEntries(
  Object.entries(TYPE_META).map(([type, meta]): [string, NotificationCategory] => [type, meta.category])
);

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
 * Decide whether a notification of `type` should be delivered via `channel`
 * to `userId`. In-app notifications always return true; push/email respect
 * the user's flags.
 */
export async function shouldSendNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationType: string,
  channel: 'push' | 'email' | 'in_app'
): Promise<boolean> {
  if (channel === 'in_app') return true;

  const res = await getNotificationPreferences(supabase, userId);
  if (!res.success || !res.data) return true; // fail open — never drop silently
  const prefs = res.data;

  if (channel === 'push' && !prefs.push_enabled) return false;
  if (channel === 'email' && !prefs.email_enabled) return false;

  const category = TYPE_CATEGORY[notificationType];
  if (!category) return true; // unmapped types default to allowed
  const categoryFlag = prefs[category];
  return !!categoryFlag;
}

/**
 * Batched push variant of shouldSendNotification for a list of recipients.
 * Returns the subset of `userIds` allowed to receive a PUSH of
 * `notificationType`, resolved in ONE query against notification_preferences
 * (never one call per recipient, which would be an N+1 on a batch send).
 *
 * Semantics match shouldSendNotification(..., 'push') exactly, per user:
 *   - a user with no preference row falls back to DEFAULT_PREFERENCES
 *     (push_enabled true, category default), so they stay allowed;
 *   - push_enabled off, or the type's category flag off, drops the user;
 *   - an unmapped type is allowed for everyone (same as the single path);
 *   - any query error fails OPEN (all userIds allowed), so a preferences
 *     lookup problem never silently drops a send.
 */
export async function filterPushRecipients(
  supabase: SupabaseClient,
  userIds: string[],
  notificationType: string
): Promise<Set<string>> {
  const allowAll = new Set<string>(userIds);
  if (userIds.length === 0) return allowAll;

  const category = TYPE_CATEGORY[notificationType];
  if (!category) return allowAll; // unmapped type: allowed for everyone

  try {
    // `category` is a controlled column name from TYPE_CATEGORY, not caller
    // input, so this interpolation is safe.
    const { data, error } = await supabase
      .from('notification_preferences')
      .select(`user_id, push_enabled, ${category}`)
      .in('user_id', userIds);
    if (error) return allowAll; // fail open, never drop silently

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      byId.set(row.user_id as string, row);
    }

    const allowed = new Set<string>();
    for (const id of userIds) {
      const row = byId.get(id);
      const pushEnabled = row
        ? ((row.push_enabled as boolean | null) ?? DEFAULT_PREFERENCES.push_enabled)
        : DEFAULT_PREFERENCES.push_enabled;
      const categoryFlag = row
        ? ((row[category] as boolean | null) ?? DEFAULT_PREFERENCES[category])
        : DEFAULT_PREFERENCES[category];
      if (pushEnabled && categoryFlag) allowed.add(id);
    }
    return allowed;
  } catch (error) {
    logError(error, { action: 'filterPushRecipients', notificationType });
    return allowAll; // fail open
  }
}
