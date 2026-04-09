/** DAL: notifications table */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Database } from '@/lib/database.types';

type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];

/** Notification with actor user details */
export interface NotificationWithActor extends NotificationRow {
  actor: { id: string; name: string; avatar_url: string | null } | null;
}

/**
 * Create a notification. Does NOT notify if actor_id === recipient_id.
 */
export async function createNotification(
  supabase: SupabaseClient,
  {
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    message,
  }: {
    recipient_id: string;
    actor_id?: string | null;
    type: string;
    entity_type?: string | null;
    entity_id?: string | null;
    message: string;
  }
): Promise<DalResult<NotificationRow>> {
  try {
    // Don't notify if actor is the recipient
    if (actor_id && actor_id === recipient_id) {
      return { success: true, data: null as any };
    }

    const data: NotificationInsert = {
      recipient_id,
      actor_id: actor_id || null,
      type,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      message,
    };

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert(data)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: notification };
  } catch (error) {
    logError(error, { action: 'createNotification', recipient_id });
    return { success: false, error: 'Failed to create notification' };
  }
}

/**
 * Fetch notifications for a user with actor info joined.
 * Ordered by created_at DESC (newest first).
 */
export async function fetchNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
  offset = 0
): Promise<DalResult<NotificationWithActor[]>> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*, actor:users!notifications_actor_id_fkey(id, name, avatar_url)')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as NotificationWithActor[] };
  } catch (error) {
    logError(error, { action: 'fetchNotifications', userId });
    return { success: false, error: 'Failed to fetch notifications' };
  }
}

/**
 * Get count of unread notifications for a user.
 */
export async function getUnreadNotificationCount(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);

    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'getUnreadNotificationCount', userId });
    return { success: false, error: 'Failed to fetch unread count' };
  }
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'markNotificationRead', notificationId });
    return { success: false, error: 'Failed to mark notification as read' };
  }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'markAllNotificationsRead', userId });
    return { success: false, error: 'Failed to mark all notifications as read' };
  }
}
