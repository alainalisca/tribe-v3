/** DAL: post_comments table (comments on instructor posts) */
import { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/logger'
import type { DalResult } from './types'

/** Comment with author details */
export interface PostCommentWithAuthor {
  id: string
  post_id: string
  author_id: string
  content: string
  created_at: string
  author: {
    id: string
    name: string
    avatar_url: string | null
  } | null
}

/** Fetch all comments on a post, ordered by created_at ASC */
export async function fetchPostComments(
  supabase: SupabaseClient,
  postId: string,
  limit: number = 20,
  offset: number = 0
): Promise<DalResult<PostCommentWithAuthor[]>> {
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .select(
        `
        id,
        post_id,
        author_id,
        content,
        created_at,
        author:users(id, name, avatar_url)
      `
      )
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      return { success: false, error: error.message }
    }

    // Map Supabase join arrays to single objects
    const comments: PostCommentWithAuthor[] = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      author: Array.isArray(c.author) ? c.author[0] : c.author,
    })) as PostCommentWithAuthor[]

    return { success: true, data: comments }
  } catch (error) {
    logError(error, { action: 'fetchPostComments', postId })
    return { success: false, error: 'Failed to fetch post comments' }
  }
}

/** Insert a new comment and increment comments_count on the post */
export async function insertPostComment(
  supabase: SupabaseClient,
  data: { post_id: string; author_id: string; content: string }
): Promise<DalResult<{ id: string }>> {
  try {
    // Insert the comment
    const { data: newComment, error: insertError } = await supabase
      .from('post_comments')
      .insert(data)
      .select('id')
      .single()

    if (insertError) {
      return { success: false, error: insertError.message }
    }

    // Increment comments_count on the post
    const { error: updateError } = await supabase
      .from('instructor_posts')
      .update({ comments_count: supabase.rpc('increment_column', { table: 'instructor_posts', column: 'comments_count', id: data.post_id }) })
      .eq('id', data.post_id)

    // Manual increment if RPC not available
    const { error: manualUpdateError } = await supabase.rpc('increment_post_comments', {
      post_id: data.post_id,
    })

    if (manualUpdateError) {
      // Fallback: just get current count and set it
      const { data: currentPost } = await supabase
        .from('instructor_posts')
        .select('comments_count')
        .eq('id', data.post_id)
        .single()

      if (currentPost) {
        await supabase
          .from('instructor_posts')
          .update({ comments_count: (currentPost.comments_count || 0) + 1 })
          .eq('id', data.post_id)
      }
    }

    return { success: true, data: { id: newComment.id } }
  } catch (error) {
    logError(error, { action: 'insertPostComment' })
    return { success: false, error: 'Failed to insert comment' }
  }
}

/** Delete a comment and decrement comments_count on the post */
export async function deletePostComment(supabase: SupabaseClient, commentId: string): Promise<DalResult<null>> {
  try {
    // Get the post_id first
    const { data: comment, error: fetchError } = await supabase
      .from('post_comments')
      .select('post_id')
      .eq('id', commentId)
      .single()

    if (fetchError) {
      return { success: false, error: fetchError.message }
    }

    // Delete the comment
    const { error: deleteError } = await supabase.from('post_comments').delete().eq('id', commentId)

    if (deleteError) {
      return { success: false, error: deleteError.message }
    }

    // Decrement comments_count on the post
    const { data: currentPost } = await supabase
      .from('instructor_posts')
      .select('comments_count')
      .eq('id', comment.post_id)
      .single()

    if (currentPost) {
      const newCount = Math.max(0, (currentPost.comments_count || 0) - 1)
      await supabase.from('instructor_posts').update({ comments_count: newCount }).eq('id', comment.post_id)
    }

    return { success: true }
  } catch (error) {
    logError(error, { action: 'deletePostComment', commentId })
    return { success: false, error: 'Failed to delete comment' }
  }
}

/** Get the comment count for a post */
export async function getPostCommentCount(supabase: SupabaseClient, postId: string): Promise<DalResult<number>> {
  try {
    const { data, error } = await supabase
      .from('instructor_posts')
      .select('comments_count')
      .eq('id', postId)
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data?.comments_count || 0 }
  } catch (error) {
    logError(error, { action: 'getPostCommentCount', postId })
    return { success: false, error: 'Failed to get comment count' }
  }
}
