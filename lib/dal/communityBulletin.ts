/** DAL: community_bulletin — bulletin board posts for the Community Bulletin tab */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

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
    return { success: true, data: data as BulletinPost };
  } catch (error) {
    logError(error, { action: 'createBulletinPost' });
    return { success: false, error: 'Failed to create bulletin post' };
  }
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
