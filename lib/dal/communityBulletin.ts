/** DAL: community_bulletin — bulletin board posts for the Community Bulletin tab */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import { ADMIN_EMAILS } from '@/lib/admin';
import { createNotification } from './notifications';

export interface BulletinPost {
  id: string;
  author_id: string;
  title: string;
  description_en: string | null;
  description_es: string | null;
  category: string;
  sport_type: string | null;
  event_date: string | null;
  event_time: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  image_url: string | null;
  external_url: string | null;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  author?: { name: string; avatar_url: string | null } | null;
}

export type BulletinCategory = 'event' | 'announcement' | 'meetup' | 'social' | 'other';

export interface CreateBulletinInput {
  author_id: string;
  title: string;
  description_en?: string | null;
  description_es?: string | null;
  category: string;
  sport_type?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  location_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  image_url?: string | null;
  external_url?: string | null;
}

/**
 * Fetch approved, active bulletin posts with optional category filter.
 * Ordered by created_at DESC (newest first).
 */
export async function fetchApprovedBulletinPosts(
  supabase: SupabaseClient,
  options?: { category?: string; limit?: number }
): Promise<DalResult<BulletinPost[]>> {
  try {
    const limit = options?.limit ?? 50;
    let query = supabase
      .from('community_bulletin')
      .select('*, author:users!author_id(name, avatar_url)')
      .eq('status', 'approved')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (options?.category && options.category !== 'all') {
      query = query.eq('category', options.category);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as BulletinPost[]) || [] };
  } catch (error) {
    logError(error, { action: 'fetchApprovedBulletinPosts' });
    return { success: false, error: 'Failed to fetch bulletin posts' };
  }
}

/**
 * Create a new bulletin post. Status defaults to 'pending' for admin review.
 */
export async function createBulletinPost(
  supabase: SupabaseClient,
  post: CreateBulletinInput
): Promise<DalResult<BulletinPost>> {
  try {
    const { data, error } = await supabase
      .from('community_bulletin')
      .insert({ ...post, status: 'pending' })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    const row = data as BulletinPost;

    // QA-09: notify admins that a new post is waiting for review. Fire-and-forget
    // — we never want the submit flow to fail because the notification failed.
    notifyAdminsOfPendingBulletin(supabase, row).catch((err) => {
      logError(err, { action: 'notifyAdminsOfPendingBulletin', postId: row.id });
    });

    return { success: true, data: row };
  } catch (error) {
    logError(error, { action: 'createBulletinPost' });
    return { success: false, error: 'Failed to create bulletin post' };
  }
}

/**
 * In-app notification to every admin when a user submits a bulletin post
 * that needs review. Resolves admin user ids by looking up the admin email
 * whitelist in the users table. Never throws (caller uses .catch).
 */
async function notifyAdminsOfPendingBulletin(supabase: SupabaseClient, post: BulletinPost): Promise<void> {
  if (!ADMIN_EMAILS.length) return;

  const { data: admins, error } = await supabase.from('users').select('id, email').in('email', ADMIN_EMAILS);

  if (error || !admins) return;

  const adminRows = admins as Array<{ id: string; email: string }>;
  await Promise.all(
    adminRows.map((admin) =>
      createNotification(supabase, {
        recipient_id: admin.id,
        actor_id: post.author_id,
        type: 'bulletin_pending',
        entity_type: 'community_bulletin',
        entity_id: post.id,
        message: `New bulletin post awaiting review: "${post.title}"`,
      })
    )
  );
}

/**
 * Fetch pending bulletin posts for admin review (newest first).
 */
export async function fetchPendingBulletinPosts(supabase: SupabaseClient): Promise<DalResult<BulletinPost[]>> {
  try {
    const { data, error } = await supabase
      .from('community_bulletin')
      .select('*, author:users!author_id(name, avatar_url)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as BulletinPost[]) || [] };
  } catch (error) {
    logError(error, { action: 'fetchPendingBulletinPosts' });
    return { success: false, error: 'Failed to fetch pending bulletin posts' };
  }
}

/**
 * Update a bulletin post status (approve / reject).
 */
export async function updateBulletinStatus(
  supabase: SupabaseClient,
  id: string,
  status: 'approved' | 'rejected'
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('community_bulletin')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updateBulletinStatus' });
    return { success: false, error: 'Failed to update bulletin status' };
  }
}

/**
 * Delete a bulletin post by id.
 */
export async function deleteBulletinPost(supabase: SupabaseClient, id: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('community_bulletin').delete().eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'deleteBulletinPost' });
    return { success: false, error: 'Failed to delete bulletin post' };
  }
}
