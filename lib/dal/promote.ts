// Data Access Layer for Tribe Promote features
// Handles all database operations for follows, storefront media, service packages,
// instructor posts, promo codes, and boost campaigns

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Database } from '@/lib/database.types';
import { createNotification } from './notifications';

// Type aliases
type StorefrontMediaRow = Database['public']['Tables']['storefront_media']['Row'];
type StorefrontMediaInsert = Database['public']['Tables']['storefront_media']['Insert'];
type ServicePackageRow = Database['public']['Tables']['service_packages']['Row'];
type ServicePackageInsert = Database['public']['Tables']['service_packages']['Insert'];
type InstructorPostRow = Database['public']['Tables']['instructor_posts']['Row'];
type InstructorPostInsert = Database['public']['Tables']['instructor_posts']['Insert'];
type PromoCodeRow = Database['public']['Tables']['promo_codes']['Row'];
type PromoCodeInsert = Database['public']['Tables']['promo_codes']['Insert'];
type BoostCampaignRow = Database['public']['Tables']['boost_campaigns']['Row'];
type BoostCampaignInsert = Database['public']['Tables']['boost_campaigns']['Insert'];
type UserFollowInsert = Database['public']['Tables']['user_follows']['Insert'];

// --- FOLLOWS ---

/**
 * Create a follow relationship between two users.
 * Optional: pass notificationMessage to create a follow notification.
 */
export async function followUser(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string,
  notificationMessage?: string
): Promise<DalResult<null>> {
  try {
    const data: UserFollowInsert = {
      follower_id: followerId,
      following_id: followingId,
    };
    const { error } = await supabase.from('user_follows').insert(data);
    if (error) return { success: false, error: error.message };

    // Create notification for the followed user
    if (notificationMessage) {
      await createNotification(supabase, {
        recipient_id: followingId,
        actor_id: followerId,
        type: 'follow',
        entity_type: null,
        entity_id: null,
        message: notificationMessage,
      });
    }

    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'followUser', followerId, followingId });
    return { success: false, error: 'Failed to follow user' };
  }
}

/**
 * Remove a follow relationship between two users.
 */
export async function unfollowUser(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('following_id', followingId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'unfollowUser', followerId, followingId });
    return { success: false, error: 'Failed to unfollow user' };
  }
}

/**
 * Get all followers of a user with user details.
 */
export async function fetchFollowers(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<Array<{ id: string; name: string; avatar_url: string | null }>>> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('follower:users!user_follows_follower_id_fkey(id, name, avatar_url)')
      .eq('following_id', userId);
    if (error) return { success: false, error: error.message };
    const followers = (data || [])
      .map((row: any) => row.follower)
      .filter(Boolean);
    return { success: true, data: followers };
  } catch (error) {
    logError(error, { action: 'fetchFollowers', userId });
    return { success: false, error: 'Failed to fetch followers' };
  }
}

/**
 * Get all users that a user follows with user details.
 */
export async function fetchFollowing(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<Array<{ id: string; name: string; avatar_url: string | null }>>> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('following:users!user_follows_following_id_fkey(id, name, avatar_url)')
      .eq('follower_id', userId);
    if (error) return { success: false, error: error.message };
    const following = (data || [])
      .map((row: any) => row.following)
      .filter(Boolean);
    return { success: true, data: following };
  } catch (error) {
    logError(error, { action: 'fetchFollowing', userId });
    return { success: false, error: 'Failed to fetch following' };
  }
}

/**
 * Check if a user follows another user.
 */
export async function isFollowing(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', followerId)
      .eq('following_id', followingId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data?.length ?? 0) > 0 };
  } catch (error) {
    logError(error, { action: 'isFollowing', followerId, followingId });
    return { success: false, error: 'Failed to check follow status' };
  }
}

/**
 * Get the count of followers for a user.
 */
export async function getFollowerCount(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<number>> {
  try {
    const { count, error } = await supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: count ?? 0 };
  } catch (error) {
    logError(error, { action: 'getFollowerCount', userId });
    return { success: false, error: 'Failed to fetch follower count' };
  }
}

// --- STOREFRONT MEDIA ---

/**
 * Get all media for a user ordered by display order.
 */
export async function fetchStorefrontMedia(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<StorefrontMediaRow[]>> {
  try {
    const { data, error } = await supabase
      .from('storefront_media')
      .select('*')
      .eq('user_id', userId)
      .order('display_order', { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchStorefrontMedia', userId });
    return { success: false, error: 'Failed to fetch storefront media' };
  }
}

/**
 * Insert new storefront media item.
 */
export async function insertStorefrontMedia(
  supabase: SupabaseClient,
  data: StorefrontMediaInsert
): Promise<DalResult<StorefrontMediaRow>> {
  try {
    const { data: media, error } = await supabase
      .from('storefront_media')
      .insert(data)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: media };
  } catch (error) {
    logError(error, { action: 'insertStorefrontMedia' });
    return { success: false, error: 'Failed to insert storefront media' };
  }
}

/**
 * Update a storefront media item.
 */
export async function updateStorefrontMedia(
  supabase: SupabaseClient,
  mediaId: string,
  data: Partial<StorefrontMediaInsert>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('storefront_media')
      .update(data)
      .eq('id', mediaId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updateStorefrontMedia', mediaId });
    return { success: false, error: 'Failed to update storefront media' };
  }
}

/**
 * Delete a storefront media item.
 */
export async function deleteStorefrontMedia(
  supabase: SupabaseClient,
  mediaId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('storefront_media').delete().eq('id', mediaId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'deleteStorefrontMedia', mediaId });
    return { success: false, error: 'Failed to delete storefront media' };
  }
}

/**
 * Reorder storefront media items by updating display_order for each ID based on array position.
 */
export async function reorderStorefrontMedia(
  supabase: SupabaseClient,
  userId: string,
  mediaIds: string[]
): Promise<DalResult<null>> {
  try {
    // Update each media item with its new display order
    for (let i = 0; i < mediaIds.length; i++) {
      const { error } = await supabase
        .from('storefront_media')
        .update({ display_order: i })
        .eq('id', mediaIds[i])
        .eq('user_id', userId);
      if (error) return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'reorderStorefrontMedia', userId });
    return { success: false, error: 'Failed to reorder storefront media' };
  }
}

// --- SERVICE PACKAGES ---

/**
 * Get all active service packages for an instructor ordered by display order.
 */
export async function fetchServicePackages(
  supabase: SupabaseClient,
  instructorId: string
): Promise<DalResult<ServicePackageRow[]>> {
  try {
    const { data, error } = await supabase
      .from('service_packages')
      .select('*')
      .eq('instructor_id', instructorId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchServicePackages', instructorId });
    return { success: false, error: 'Failed to fetch service packages' };
  }
}

/**
 * Get a single service package by ID.
 */
export async function fetchServicePackageById(
  supabase: SupabaseClient,
  packageId: string
): Promise<DalResult<ServicePackageRow>> {
  try {
    const { data, error } = await supabase
      .from('service_packages')
      .select('*')
      .eq('id', packageId)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchServicePackageById', packageId });
    return { success: false, error: 'Failed to fetch service package' };
  }
}

/**
 * Create a new service package.
 */
export async function insertServicePackage(
  supabase: SupabaseClient,
  data: ServicePackageInsert
): Promise<DalResult<ServicePackageRow>> {
  try {
    const { data: pkg, error } = await supabase
      .from('service_packages')
      .insert(data)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: pkg };
  } catch (error) {
    logError(error, { action: 'insertServicePackage' });
    return { success: false, error: 'Failed to create service package' };
  }
}

/**
 * Update a service package.
 */
export async function updateServicePackage(
  supabase: SupabaseClient,
  packageId: string,
  data: Partial<ServicePackageInsert>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('service_packages')
      .update(data)
      .eq('id', packageId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updateServicePackage', packageId });
    return { success: false, error: 'Failed to update service package' };
  }
}

/**
 * Deactivate a service package (soft delete).
 */
export async function deactivateServicePackage(
  supabase: SupabaseClient,
  packageId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('service_packages')
      .update({ is_active: false })
      .eq('id', packageId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'deactivateServicePackage', packageId });
    return { success: false, error: 'Failed to deactivate service package' };
  }
}

// --- INSTRUCTOR POSTS ---

/**
 * Get all posts by an author, newest first.
 */
export async function fetchInstructorPosts(
  supabase: SupabaseClient,
  authorId: string,
  limit: number = 20,
  offset: number = 0
): Promise<DalResult<InstructorPostRow[]>> {
  try {
    const { data, error } = await supabase
      .from('instructor_posts')
      .select('*')
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchInstructorPosts', authorId });
    return { success: false, error: 'Failed to fetch instructor posts' };
  }
}

/**
 * Get posts from all users that a user follows, newest first.
 */
export async function fetchFeedPosts(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<DalResult<InstructorPostRow[]>> {
  try {
    // First, get the list of users this person follows
    const { data: followsData, error: followsError } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followsError) return { success: false, error: followsError.message };

    // Extract following IDs to an array
    const followingIds = (followsData || []).map((row) => row.following_id);

    // If no follows, return empty
    if (followingIds.length === 0) {
      return { success: true, data: [] };
    }

    // Now query posts using the extracted array
    const { data, error } = await supabase
      .from('instructor_posts')
      .select('*')
      .in('author_id', followingIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchFeedPosts', userId });
    return { success: false, error: 'Failed to fetch feed posts' };
  }
}

/**
 * Create a new instructor post.
 */
export async function insertPost(
  supabase: SupabaseClient,
  data: InstructorPostInsert
): Promise<DalResult<InstructorPostRow>> {
  try {
    const { data: post, error } = await supabase
      .from('instructor_posts')
      .insert(data)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: post };
  } catch (error) {
    logError(error, { action: 'insertPost' });
    return { success: false, error: 'Failed to create post' };
  }
}

/**
 * Update an instructor post.
 */
export async function updatePost(
  supabase: SupabaseClient,
  postId: string,
  data: Partial<InstructorPostInsert>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('instructor_posts')
      .update(data)
      .eq('id', postId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updatePost', postId });
    return { success: false, error: 'Failed to update post' };
  }
}

/**
 * Delete an instructor post.
 */
export async function deletePost(
  supabase: SupabaseClient,
  postId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('instructor_posts').delete().eq('id', postId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'deletePost', postId });
    return { success: false, error: 'Failed to delete post' };
  }
}

/**
 * Add a like to a post.
 * Optional: pass notificationMessage to create a like notification.
 */
export async function likePost(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
  notificationMessage?: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('post_likes').insert({
      post_id: postId,
      user_id: userId,
    });
    if (error) return { success: false, error: error.message };

    // Create notification for the post author
    if (notificationMessage) {
      // Get the post author ID
      const { data: post, error: postError } = await supabase
        .from('instructor_posts')
        .select('author_id')
        .eq('id', postId)
        .single();

      if (!postError && post) {
        await createNotification(supabase, {
          recipient_id: post.author_id,
          actor_id: userId,
          type: 'like',
          entity_type: 'post',
          entity_id: postId,
          message: notificationMessage,
        });
      }
    }

    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'likePost', postId, userId });
    return { success: false, error: 'Failed to like post' };
  }
}

/**
 * Remove a like from a post.
 */
export async function unlikePost(
  supabase: SupabaseClient,
  postId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'unlikePost', postId, userId });
    return { success: false, error: 'Failed to unlike post' };
  }
}

/**
 * Check if a user has liked a post.
 */
export async function hasLikedPost(
  supabase: SupabaseClient,
  postId: string,
  userId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('post_likes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data?.length ?? 0) > 0 };
  } catch (error) {
    logError(error, { action: 'hasLikedPost', postId, userId });
    return { success: false, error: 'Failed to check like status' };
  }
}

// --- PROMO CODES ---

/**
 * Get all promo codes for an instructor.
 */
export async function fetchPromoCodes(
  supabase: SupabaseClient,
  instructorId: string
): Promise<DalResult<PromoCodeRow[]>> {
  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('instructor_id', instructorId)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchPromoCodes', instructorId });
    return { success: false, error: 'Failed to fetch promo codes' };
  }
}

/**
 * Lookup a promo code by its code string.
 */
export async function fetchPromoCodeByCode(
  supabase: SupabaseClient,
  code: string
): Promise<DalResult<PromoCodeRow>> {
  try {
    const { data, error } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchPromoCodeByCode', code });
    return { success: false, error: 'Failed to fetch promo code' };
  }
}

/**
 * Create a new promo code.
 */
export async function insertPromoCode(
  supabase: SupabaseClient,
  data: PromoCodeInsert
): Promise<DalResult<PromoCodeRow>> {
  try {
    const { data: promo, error } = await supabase
      .from('promo_codes')
      .insert(data)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: promo };
  } catch (error) {
    logError(error, { action: 'insertPromoCode' });
    return { success: false, error: 'Failed to create promo code' };
  }
}

/**
 * Update a promo code.
 */
export async function updatePromoCode(
  supabase: SupabaseClient,
  promoId: string,
  data: Partial<PromoCodeInsert>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('promo_codes')
      .update(data)
      .eq('id', promoId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updatePromoCode', promoId });
    return { success: false, error: 'Failed to update promo code' };
  }
}

/**
 * Deactivate a promo code (soft delete).
 */
export async function deactivatePromoCode(
  supabase: SupabaseClient,
  promoId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('promo_codes')
      .update({ is_active: false })
      .eq('id', promoId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'deactivatePromoCode', promoId });
    return { success: false, error: 'Failed to deactivate promo code' };
  }
}

/**
 * Record a promo code redemption.
 */
export async function redeemPromoCode(
  supabase: SupabaseClient,
  promoCodeId: string,
  userId: string,
  paymentId: string | null,
  discountAmountCents: number
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('promo_redemptions').insert({
      promo_code_id: promoCodeId,
      user_id: userId,
      payment_id: paymentId,
      discount_amount_cents: discountAmountCents,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'redeemPromoCode', promoCodeId, userId });
    return { success: false, error: 'Failed to redeem promo code' };
  }
}

/**
 * Validate a promo code. Returns the promo code data if valid.
 * Checks if code is active, not expired, and not maxed out.
 */
export async function validatePromoCode(
  supabase: SupabaseClient,
  code: string,
  instructorId?: string
): Promise<DalResult<PromoCodeRow>> {
  try {
    let query = supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true);

    if (instructorId) {
      query = query.eq('instructor_id', instructorId);
    }

    const { data, error } = await query.single();

    if (error) return { success: false, error: error.message };

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { success: false, error: 'Promo code has expired' };
    }

    // Check if maxed out
    if (data.max_uses !== null && data.current_uses >= data.max_uses) {
      return { success: false, error: 'Promo code has reached maximum uses' };
    }

    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'validatePromoCode', code });
    return { success: false, error: 'Failed to validate promo code' };
  }
}

// --- BOOST CAMPAIGNS ---

/**
 * Get all boost campaigns for an instructor.
 */
export async function fetchBoostCampaigns(
  supabase: SupabaseClient,
  instructorId: string
): Promise<DalResult<BoostCampaignRow[]>> {
  try {
    const { data, error } = await supabase
      .from('boost_campaigns')
      .select('*')
      .eq('instructor_id', instructorId)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchBoostCampaigns', instructorId });
    return { success: false, error: 'Failed to fetch boost campaigns' };
  }
}

/**
 * Get all active boost campaigns (for displaying in feed).
 */
export async function fetchActiveBoosts(
  supabase: SupabaseClient
): Promise<DalResult<BoostCampaignRow[]>> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('boost_campaigns')
      .select('*')
      .eq('status', 'active')
      .lte('starts_at', now)
      .gte('ends_at', now)
      .order('created_at', { ascending: false });
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchActiveBoosts' });
    return { success: false, error: 'Failed to fetch active boosts' };
  }
}

/**
 * Get session IDs that are currently boosted.
 */
export async function fetchActiveBoostedSessionIds(
  supabase: SupabaseClient
): Promise<DalResult<string[]>> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('boost_campaigns')
      .select('boosted_session_id')
      .eq('status', 'active')
      .lte('starts_at', now)
      .gte('ends_at', now)
      .not('boosted_session_id', 'is', null);
    if (error) return { success: false, error: error.message };
    const sessionIds = (data || [])
      .map((row: any) => row.boosted_session_id)
      .filter(Boolean);
    return { success: true, data: sessionIds };
  } catch (error) {
    logError(error, { action: 'fetchActiveBoostedSessionIds' });
    return { success: false, error: 'Failed to fetch boosted session IDs' };
  }
}

/**
 * Create a new boost campaign.
 */
export async function insertBoostCampaign(
  supabase: SupabaseClient,
  data: BoostCampaignInsert
): Promise<DalResult<BoostCampaignRow>> {
  try {
    const { data: campaign, error } = await supabase
      .from('boost_campaigns')
      .insert(data)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: campaign };
  } catch (error) {
    logError(error, { action: 'insertBoostCampaign' });
    return { success: false, error: 'Failed to create boost campaign' };
  }
}

/**
 * Update a boost campaign.
 */
export async function updateBoostCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  data: Partial<BoostCampaignInsert>
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('boost_campaigns')
      .update(data)
      .eq('id', campaignId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'updateBoostCampaign', campaignId });
    return { success: false, error: 'Failed to update boost campaign' };
  }
}

/**
 * Cancel a boost campaign (set status to 'cancelled').
 */
export async function cancelBoostCampaign(
  supabase: SupabaseClient,
  campaignId: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('boost_campaigns')
      .update({ status: 'cancelled' })
      .eq('id', campaignId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'cancelBoostCampaign', campaignId });
    return { success: false, error: 'Failed to cancel boost campaign' };
  }
}

/**
 * Record a boost campaign impression (increment impressions by 1).
 */
export async function recordBoostImpression(
  supabase: SupabaseClient,
  campaignId: string
): Promise<DalResult<null>> {
  try {
    const { data: campaign, error: fetchError } = await supabase
      .from('boost_campaigns')
      .select('impressions')
      .eq('id', campaignId)
      .single();

    if (fetchError) return { success: false, error: fetchError.message };

    const { error } = await supabase
      .from('boost_campaigns')
      .update({ impressions: (campaign?.impressions ?? 0) + 1 })
      .eq('id', campaignId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'recordBoostImpression', campaignId });
    return { success: false, error: 'Failed to record boost impression' };
  }
}

/**
 * Record a boost campaign click (increment clicks by 1).
 */
export async function recordBoostClick(
  supabase: SupabaseClient,
  campaignId: string
): Promise<DalResult<null>> {
  try {
    const { data: campaign, error: fetchError } = await supabase
      .from('boost_campaigns')
      .select('clicks')
      .eq('id', campaignId)
      .single();

    if (fetchError) return { success: false, error: fetchError.message };

    const { error } = await supabase
      .from('boost_campaigns')
      .update({ clicks: (campaign?.clicks ?? 0) + 1 })
      .eq('id', campaignId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'recordBoostClick', campaignId });
    return { success: false, error: 'Failed to record boost click' };
  }
}
