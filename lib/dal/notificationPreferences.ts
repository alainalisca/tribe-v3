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
  // Following an instructor IS the affirmative opt-in, and it is a per-instructor
  // subscription, which is stronger consent than any global toggle. So updates to
  // followers are transactional; the instructor_updates category still lets a
  // user turn them off.
  instructor_new_session: { category: 'instructor_updates', class: 'transactional' },
  instructor_post: { category: 'instructor_updates', class: 'transactional' },
  challenge_complete: { category: 'challenges', class: 'transactional' },
  challenge_join: { category: 'challenges', class: 'transactional' },
  spotlight_selected: { category: 'marketing', class: 'transactional' },
  referral_complete: { category: 'marketing', class: 'transactional' },
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
 * to `userId`, honoring the type's delivery class (TYPE_META):
 *
 *   in_app                -> always true (never gated).
 *   email, transactional  -> ignore email_enabled AND the category. Send.
 *   email, marketing      -> require email_enabled AND the category flag.
 *   push,  transactional  -> require push_enabled, bypass the category.
 *   push,  marketing      -> require push_enabled AND the category flag.
 *
 * push_enabled / email_enabled stay hard channel masters for marketing on both
 * channels and for transactional push. The only master bypass is transactional
 * EMAIL, and transactional sends of either channel skip the category.
 */
export async function shouldSendNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationType: string,
  channel: 'push' | 'email' | 'in_app'
): Promise<boolean> {
  if (channel === 'in_app') return true; // in-app is never gated

  const meta = TYPE_META[notificationType];
  // Unmapped type: treated as MARKETING with no category. It therefore respects
  // the channel master toggle but requires no category flag, which reproduces
  // the historical fail-open behavior (allow unless the master is off). It is
  // deliberately NOT treated as transactional, since that would newly bypass
  // email_enabled and start sending mail that is suppressed today.
  const cls: NotificationClass = meta?.class ?? 'marketing';
  const category = meta?.category;

  // Transactional email ignores email_enabled AND the category: a receipt or
  // confirmation must not be blocked by a marketing opt-out. It needs no prefs
  // read, so it also never depends on the fetch below.
  if (channel === 'email' && cls === 'transactional') return true;

  const res = await getNotificationPreferences(supabase, userId);
  if (!res.success || !res.data) return true; // fail open — never drop silently
  const prefs = res.data;

  // Hard channel masters (unchanged) for everything that reaches here: marketing
  // on either channel, and transactional push.
  if (channel === 'push' && !prefs.push_enabled) return false;
  if (channel === 'email' && !prefs.email_enabled) return false;

  // Master passed. Transactional bypasses the category; marketing requires it.
  // An unmapped (marketing) type has no category, so it is allowed here.
  if (cls === 'transactional') return true;
  if (!category) return true;
  return !!prefs[category];
}

/**
 * Batched PUSH variant of shouldSendNotification for a list of recipients.
 * Returns the subset of `userIds` allowed to receive a PUSH of
 * `notificationType`, resolved in ONE query against notification_preferences
 * (never one call per recipient, which would be an N+1 on a batch send).
 *
 * Class-aware, matching shouldSendNotification(..., 'push') exactly per user:
 *   - push_enabled is a hard master for both classes: off -> dropped;
 *   - transactional bypasses the category (push_enabled alone decides);
 *   - marketing requires the type's category flag as well;
 *   - an unmapped type is treated as MARKETING with no category, so it needs
 *     push_enabled but no category flag (same as the single path, and no longer
 *     the old blanket allow-all that ignored push_enabled);
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
  // Unmapped type: treated as MARKETING with no category (see
  // shouldSendNotification), so it respects push_enabled but requires no flag.
  const cls: NotificationClass = meta?.class ?? 'marketing';
  const category = meta?.category;
  // Only a marketing type WITH a category needs the category column fetched.
  const needCategory = cls === 'marketing' && !!category;

  try {
    // `category` is a controlled column name from TYPE_META, not caller input,
    // so this interpolation is safe.
    const columns = needCategory ? `user_id, push_enabled, ${category}` : 'user_id, push_enabled';
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
      if (!pushEnabled) continue; // push master off drops both classes

      // Transactional, or unmapped-marketing with no category: master alone decides.
      if (cls === 'transactional' || !category) {
        allowed.add(id);
        continue;
      }

      // Marketing with a category: the category flag must also be on.
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
