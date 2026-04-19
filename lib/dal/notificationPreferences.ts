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
  push_enabled: true,
  email_enabled: false,
};

/** Notification type → preference flag mapping. */
export const TYPE_CATEGORY: Record<
  string,
  keyof Omit<NotificationPreferences, 'user_id' | 'push_enabled' | 'email_enabled'>
> = {
  session_reminder: 'session_reminders',
  session_update: 'session_updates',
  session_join: 'session_updates',
  follow: 'social_activity',
  like: 'social_activity',
  comment: 'social_activity',
  connection_request: 'social_activity',
  new_message: 'messages',
  dm: 'messages',
  habit_session: 'training_nudges',
  streak_risk: 'training_nudges',
  streak_milestone: 'training_nudges',
  comeback: 'training_nudges',
  review_reminder: 'training_nudges',
  instructor_new_session: 'instructor_updates',
  instructor_post: 'instructor_updates',
  challenge_complete: 'challenges',
  challenge_join: 'challenges',
  spotlight_selected: 'marketing',
  referral_complete: 'marketing',
  general: 'marketing',
  weekly_recap: 'weekly_recap',
  waitlist_offered: 'session_updates',
  waitlist_expired: 'session_updates',
  training_interest: 'messages',
  tip_received: 'messages',
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
