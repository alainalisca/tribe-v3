/** DAL: instructor_posts + post_likes + post_comments — instructor content feed. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type PostType = 'text' | 'photo' | 'video' | 'tip' | 'workout' | 'session_preview';

export interface PostWithAuthor {
  id: string;
  post_type: PostType;
  title: string | null;
  title_es: string | null;
  body: string;
  body_es: string | null;
  media_urls: string[];
  thumbnail_url: string | null;
  linked_session_id: string | null;
  linked_session?: {
    id: string;
    title: string | null;
    date: string;
    sport: string | null;
  } | null;
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  created_at: string;
  author: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified_instructor: boolean | null;
  } | null;
  user_has_liked?: boolean;
}

export interface CommentWithUser {
  id: string;
  body: string;
  created_at: string;
  user: { id: string; name: string; avatar_url: string | null } | null;
}

export interface CreatePostInput {
  instructorId: string;
  postType: PostType;
  title?: string;
  titleEs?: string;
  body: string;
  bodyEs?: string;
  mediaUrls?: string[];
  thumbnailUrl?: string;
  linkedSessionId?: string;
}

/** Create a new post authored by an instructor. */
export async function createPost(supabase: SupabaseClient, post: CreatePostInput): Promise<DalResult<{ id: string }>> {
  try {
    if (!post.body.trim()) {
      return { success: false, error: 'Post body is required' };
    }
    const { data, error } = await supabase
      .from('instructor_posts')
      .insert({
        // live schema uses author_id
        author_id: post.instructorId,
        post_type: post.postType,
        title: post.title ?? null,
        title_es: post.titleEs ?? null,
        body: post.body,
        body_es: post.bodyEs ?? null,
        media_urls: post.mediaUrls ?? [],
        thumbnail_url: post.thumbnailUrl ?? null,
        linked_session_id: post.linkedSessionId ?? null,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'createPost' });
    return { success: false, error: 'Failed to create post' };
  }
}

/** Delete a post (instructor must own it, enforced by RLS + check). */
export async function deletePost(
  supabase: SupabaseClient,
  postId: string,
  instructorId: string
): Promise<DalResult<void>> {
  try {
    const { error } = await supabase.from('instructor_posts').delete().eq('id', postId).eq('author_id', instructorId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    logError(error, { action: 'deletePost', postId });
    return { success: false, error: 'Failed to delete post' };
  }
}

/**
 * Fetch feed posts. If `instructorId` is provided, returns only that
 * instructor's posts (e.g. for a storefront Posts tab).
 */
export async function fetchFeedPosts(
  supabase: SupabaseClient,
  options: {
    limit?: number;
    offset?: number;
    instructorId?: string;
    viewerId?: string;
  } = {}
): Promise<DalResult<{ posts: PostWithAuthor[]; total: number }>> {
  try {
    const { limit = 10, offset = 0, instructorId, viewerId } = options;

    let countQuery = supabase.from('instructor_posts').select('id', { count: 'exact', head: true });
    if (instructorId) countQuery = countQuery.eq('author_id', instructorId);
    const { count, error: countError } = await countQuery;
    if (countError) return { success: false, error: countError.message };

    let query = supabase
      .from('instructor_posts')
      .select(
        `
        id, post_type, title, title_es, body, body_es,
        media_urls, thumbnail_url, linked_session_id,
        like_count, comment_count, is_pinned, created_at,
        author:author_id(id, name, avatar_url, is_verified_instructor),
        linked_session:linked_session_id(id, title, date, sport)
      `
      )
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (instructorId) query = query.eq('author_id', instructorId);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    const posts: PostWithAuthor[] = (data || []).map((row: Record<string, unknown>) => {
      const authorRel = row.author as {
        id: string;
        name: string;
        avatar_url: string | null;
        is_verified_instructor: boolean | null;
      } | null;
      const linked = row.linked_session as {
        id: string;
        title: string | null;
        date: string;
        sport: string | null;
      } | null;
      return {
        id: row.id as string,
        post_type: row.post_type as PostType,
        title: (row.title as string | null) ?? null,
        title_es: (row.title_es as string | null) ?? null,
        body: (row.body as string | null) ?? '',
        body_es: (row.body_es as string | null) ?? null,
        media_urls: (row.media_urls as string[] | null) ?? [],
        thumbnail_url: (row.thumbnail_url as string | null) ?? null,
        linked_session_id: (row.linked_session_id as string | null) ?? null,
        linked_session: linked ?? null,
        like_count: (row.like_count as number | null) ?? 0,
        comment_count: (row.comment_count as number | null) ?? 0,
        is_pinned: !!row.is_pinned,
        created_at: row.created_at as string,
        author: authorRel,
      };
    });

    // Annotate which posts the viewer has liked.
    if (viewerId && posts.length > 0) {
      const postIds = posts.map((p) => p.id);
      const { data: likesData } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', viewerId)
        .in('post_id', postIds);
      const likedSet = new Set((likesData || []).map((l) => (l as { post_id: string }).post_id));
      for (const p of posts) p.user_has_liked = likedSet.has(p.id);
    }

    return { success: true, data: { posts, total: count ?? 0 } };
  } catch (error) {
    logError(error, { action: 'fetchFeedPosts' });
    return { success: false, error: 'Failed to fetch feed posts' };
  }
}

/** Toggle a like on a post for a given user. Returns new state + count. */
export async function togglePostLike(
  supabase: SupabaseClient,
  postId: string,
  userId: string
): Promise<DalResult<{ liked: boolean; likeCount: number }>> {
  try {
    const { data: existing, error: existErr } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existErr) return { success: false, error: existErr.message };

    if (existing) {
      const { error: delErr } = await supabase
        .from('post_likes')
        .delete()
        .eq('id', (existing as { id: string }).id);
      if (delErr) return { success: false, error: delErr.message };
    } else {
      const { error: insErr } = await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
      if (insErr) return { success: false, error: insErr.message };
    }

    // Refresh count (trigger will have updated it by now)
    const { data: post, error: postErr } = await supabase
      .from('instructor_posts')
      .select('like_count')
      .eq('id', postId)
      .single();
    if (postErr) return { success: false, error: postErr.message };

    return {
      success: true,
      data: {
        liked: !existing,
        likeCount: (post as { like_count: number | null })?.like_count ?? 0,
      },
    };
  } catch (error) {
    logError(error, { action: 'togglePostLike', postId });
    return { success: false, error: 'Failed to toggle like' };
  }
}

export async function addPostComment(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
  body: string
): Promise<DalResult<{ id: string }>> {
  try {
    if (!body.trim()) return { success: false, error: 'Comment body is required' };
    // post_comments live schema uses author_id + content (not user_id + body).
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, author_id: userId, content: body.trim() })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as { id: string }).id } };
  } catch (error) {
    logError(error, { action: 'addPostComment', postId });
    return { success: false, error: 'Failed to add comment' };
  }
}

export async function fetchPostComments(
  supabase: SupabaseClient,
  postId: string,
  limit: number = 20,
  offset: number = 0
): Promise<DalResult<CommentWithUser[]>> {
  try {
    // Live schema: content (not body), author_id (not user_id). Normalize
    // to the DAL's canonical shape so callers keep working.
    const { data, error } = await supabase
      .from('post_comments')
      .select(
        `
        id, content, created_at,
        user:author_id(id, name, avatar_url)
      `
      )
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) return { success: false, error: error.message };

    const comments: CommentWithUser[] = (data || []).map((row: Record<string, unknown>) => {
      const u = row.user as { id: string; name: string; avatar_url: string | null } | null;
      // DB returns `content`; DAL exposes it as `body` for callers.
      return {
        id: row.id as string,
        body: (row.content as string) ?? '',
        created_at: row.created_at as string,
        user: u,
      };
    });
    return { success: true, data: comments };
  } catch (error) {
    logError(error, { action: 'fetchPostComments', postId });
    return { success: false, error: 'Failed to fetch comments' };
  }
}
