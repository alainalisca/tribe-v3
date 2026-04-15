/** DAL: communities, community_members, community_posts, community_post_comments, community_post_likes */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

// ─── Type definitions for joined queries ───

export interface CommunityWithCreator {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  sport: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_name: string | null;
  creator_id: string;
  is_private: boolean;
  member_count: number;
  created_at: string;
  creator?: { id: string; name: string; avatar_url: string | null } | null;
}

// Extended post type that includes pin metadata (added in migration 027).
export interface CommunityPostWithPin extends CommunityPostWithAuthor {
  is_pinned?: boolean | null;
  pinned_at?: string | null;
}

export interface CommunityMemberWithUser {
  id: string;
  community_id: string;
  user_id: string;
  role: 'admin' | 'moderator' | 'member';
  joined_at: string;
  user?: { id: string; name: string; avatar_url: string | null } | null;
}

export interface CommunityPostWithAuthor {
  id: string;
  community_id: string;
  author_id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author?: { id: string; name: string; avatar_url: string | null } | null;
}

export interface CommunityPostCommentWithAuthor {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: { id: string; name: string; avatar_url: string | null } | null;
}

// ─── Discovery and fetch functions ───

export async function fetchCommunities(
  supabase: SupabaseClient,
  options?: {
    sport?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<DalResult<CommunityWithCreator[]>> {
  try {
    const { sport, search, limit = 20, offset = 0 } = options || {};

    let query = supabase
      .from('communities')
      .select('*, creator:creator_id(id, name, avatar_url)')
      .eq('is_private', false)
      .order('member_count', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (sport && sport !== 'All') {
      query = query.eq('sport', sport);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchCommunities' });
    return { success: false, error: 'Failed to fetch communities' };
  }
}

export async function fetchUserCommunities(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<CommunityWithCreator[]>> {
  try {
    const { data, error } = await supabase.from('community_members').select('community_id').eq('user_id', userId);

    if (error) return { success: false, error: error.message };

    if (!data || data.length === 0) {
      return { success: true, data: [] };
    }

    const communityIds = data.map((m) => m.community_id);

    const { data: communities, error: commError } = await supabase
      .from('communities')
      .select('*, creator:creator_id(id, name, avatar_url)')
      .in('id', communityIds)
      .order('created_at', { ascending: false });

    if (commError) return { success: false, error: commError.message };
    return { success: true, data: communities || [] };
  } catch (error) {
    logError(error, { action: 'fetchUserCommunities' });
    return { success: false, error: 'Failed to fetch user communities' };
  }
}

export async function fetchCommunityById(
  supabase: SupabaseClient,
  communityId: string
): Promise<DalResult<CommunityWithCreator>> {
  try {
    const { data, error } = await supabase
      .from('communities')
      .select('*, creator:creator_id(id, name, avatar_url)')
      .eq('id', communityId)
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (error) {
    logError(error, { action: 'fetchCommunityById' });
    return { success: false, error: 'Failed to fetch community' };
  }
}

// ─── Community management ───

export async function createCommunity(
  supabase: SupabaseClient,
  data: {
    name: string;
    description?: string;
    cover_image_url?: string;
    sport?: string;
    location_lat?: number;
    location_lng?: number;
    location_name?: string;
    creator_id: string;
    is_private?: boolean;
  }
): Promise<DalResult<string>> {
  try {
    const { data: community, error } = await supabase
      .from('communities')
      .insert({
        name: data.name,
        description: data.description,
        cover_image_url: data.cover_image_url,
        sport: data.sport,
        location_lat: data.location_lat,
        location_lng: data.location_lng,
        location_name: data.location_name,
        creator_id: data.creator_id,
        is_private: data.is_private ?? false,
        member_count: 1,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };

    // Add creator as admin member
    const { error: memberError } = await supabase.from('community_members').insert({
      community_id: community.id,
      user_id: data.creator_id,
      role: 'admin',
    });

    if (memberError) {
      // Clean up community if member insert fails
      await supabase.from('communities').delete().eq('id', community.id);
      return { success: false, error: memberError.message };
    }

    return { success: true, data: community.id };
  } catch (error) {
    logError(error, { action: 'createCommunity' });
    return { success: false, error: 'Failed to create community' };
  }
}

export async function joinCommunity(
  supabase: SupabaseClient,
  communityId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error: memberError } = await supabase.from('community_members').insert({
      community_id: communityId,
      user_id: userId,
      role: 'member',
    });

    if (memberError) return { success: false, error: memberError.message };

    // Increment member count
    const { error: updateError } = await supabase.rpc('increment', {
      table: 'communities',
      column: 'member_count',
      value: 1,
      id: communityId,
    });

    if (updateError) {
      // Rollback member insert
      await supabase.from('community_members').delete().eq('user_id', userId).eq('community_id', communityId);
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    logError(error, { action: 'joinCommunity' });
    return { success: false, error: 'Failed to join community' };
  }
}

export async function leaveCommunity(
  supabase: SupabaseClient,
  communityId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error: deleteError } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', userId);

    if (deleteError) return { success: false, error: deleteError.message };

    // Decrement member count
    const { error: updateError } = await supabase.rpc('decrement', {
      table: 'communities',
      column: 'member_count',
      value: 1,
      id: communityId,
    });

    if (updateError) {
      logError(updateError, { action: 'leaveCommunity - decrement failed' });
      // Don't fail the whole operation if decrement fails
    }

    return { success: true };
  } catch (error) {
    logError(error, { action: 'leaveCommunity' });
    return { success: false, error: 'Failed to leave community' };
  }
}

export async function isCommunityMember(
  supabase: SupabaseClient,
  communityId: string,
  userId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('community_members')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found
      return { success: false, error: error.message };
    }

    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'isCommunityMember' });
    return { success: false, error: 'Failed to check membership' };
  }
}

export async function fetchCommunityMembers(
  supabase: SupabaseClient,
  communityId: string
): Promise<DalResult<CommunityMemberWithUser[]>> {
  try {
    const { data, error } = await supabase
      .from('community_members')
      .select('*, user:user_id(id, name, avatar_url)')
      .eq('community_id', communityId)
      .order('role', { ascending: false })
      .order('joined_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchCommunityMembers' });
    return { success: false, error: 'Failed to fetch members' };
  }
}

// ─── Posts ───

export async function fetchCommunityPosts(
  supabase: SupabaseClient,
  communityId: string,
  limit: number = 20,
  offset: number = 0
): Promise<DalResult<CommunityPostWithAuthor[]>> {
  try {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*, author:author_id(id, name, avatar_url)')
      .eq('community_id', communityId)
      .order('is_pinned', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchCommunityPosts' });
    return { success: false, error: 'Failed to fetch posts' };
  }
}

export async function insertCommunityPost(
  supabase: SupabaseClient,
  data: {
    community_id: string;
    author_id: string;
    content: string;
    media_url?: string;
    media_type?: string;
  }
): Promise<DalResult<string>> {
  try {
    const { data: post, error } = await supabase
      .from('community_posts')
      .insert({
        community_id: data.community_id,
        author_id: data.author_id,
        content: data.content,
        media_url: data.media_url,
        media_type: data.media_type,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: post.id };
  } catch (error) {
    logError(error, { action: 'insertCommunityPost' });
    return { success: false, error: 'Failed to create post' };
  }
}

export async function deleteCommunityPost(supabase: SupabaseClient, postId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('community_posts').delete().eq('id', postId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteCommunityPost' });
    return { success: false, error: 'Failed to delete post' };
  }
}

// ─── Likes ───

export async function likeCommunityPost(
  supabase: SupabaseClient,
  postId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error: insertError } = await supabase.from('community_post_likes').insert({
      post_id: postId,
      user_id: userId,
    });

    if (insertError) return { success: false, error: insertError.message };

    // Increment likes count
    await supabase.rpc('increment', {
      table: 'community_posts',
      column: 'likes_count',
      value: 1,
      id: postId,
    });

    return { success: true };
  } catch (error) {
    logError(error, { action: 'likeCommunityPost' });
    return { success: false, error: 'Failed to like post' };
  }
}

export async function unlikeCommunityPost(
  supabase: SupabaseClient,
  postId: string,
  userId: string
): Promise<DalResult<null>> {
  try {
    const { error: deleteError } = await supabase
      .from('community_post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (deleteError) return { success: false, error: deleteError.message };

    // Decrement likes count
    await supabase.rpc('decrement', {
      table: 'community_posts',
      column: 'likes_count',
      value: 1,
      id: postId,
    });

    return { success: true };
  } catch (error) {
    logError(error, { action: 'unlikeCommunityPost' });
    return { success: false, error: 'Failed to unlike post' };
  }
}

export async function hasLikedCommunityPost(
  supabase: SupabaseClient,
  postId: string,
  userId: string
): Promise<DalResult<boolean>> {
  try {
    const { data, error } = await supabase
      .from('community_post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { success: false, error: error.message };
    }

    return { success: true, data: !!data };
  } catch (error) {
    logError(error, { action: 'hasLikedCommunityPost' });
    return { success: false, error: 'Failed to check like status' };
  }
}

// ─── Comments ───

export async function insertCommunityPostComment(
  supabase: SupabaseClient,
  data: {
    post_id: string;
    author_id: string;
    content: string;
  }
): Promise<DalResult<string>> {
  try {
    const { data: comment, error } = await supabase
      .from('community_post_comments')
      .insert({
        post_id: data.post_id,
        author_id: data.author_id,
        content: data.content,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };

    // Increment comments count
    await supabase.rpc('increment', {
      table: 'community_posts',
      column: 'comments_count',
      value: 1,
      id: data.post_id,
    });

    return { success: true, data: comment.id };
  } catch (error) {
    logError(error, { action: 'insertCommunityPostComment' });
    return { success: false, error: 'Failed to create comment' };
  }
}

export async function fetchCommunityPostComments(
  supabase: SupabaseClient,
  postId: string
): Promise<DalResult<CommunityPostCommentWithAuthor[]>> {
  try {
    const { data, error } = await supabase
      .from('community_post_comments')
      .select('*, author:author_id(id, name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchCommunityPostComments' });
    return { success: false, error: 'Failed to fetch comments' };
  }
}

// ─── Banner / cover image management ───

export async function updateCommunityCoverImage(
  supabase: SupabaseClient,
  communityId: string,
  coverImageUrl: string
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('communities')
      .update({ cover_image_url: coverImageUrl })
      .eq('id', communityId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'updateCommunityCoverImage' });
    return { success: false, error: 'Failed to update community banner' };
  }
}

// ─── Post moderation ───

export async function setCommunityPostPinned(
  supabase: SupabaseClient,
  postId: string,
  pinned: boolean
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase
      .from('community_posts')
      .update({
        is_pinned: pinned,
        pinned_at: pinned ? new Date().toISOString() : null,
      })
      .eq('id', postId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'setCommunityPostPinned' });
    return { success: false, error: 'Failed to update pin state' };
  }
}

export async function reportCommunityPost(
  supabase: SupabaseClient,
  data: { post_id: string; reporter_id: string; reason?: string }
): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('community_post_reports').insert({
      post_id: data.post_id,
      reporter_id: data.reporter_id,
      reason: data.reason ?? null,
    });

    if (error) {
      // Treat duplicate (unique constraint) as success — already reported.
      if (error.code === '23505') return { success: true };
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'reportCommunityPost' });
    return { success: false, error: 'Failed to report post' };
  }
}
