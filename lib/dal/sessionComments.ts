/** DAL: session_comments table (pre-session Q&A on session detail pages) */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** Session comment with author details */
export interface SessionCommentWithAuthor {
  id: string;
  session_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

/** Fetch all comments on a session, ordered by created_at ASC */
export async function fetchSessionComments(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<SessionCommentWithAuthor[]>> {
  try {
    const { data, error } = await supabase
      .from('session_comments')
      .select(
        `
        id,
        session_id,
        author_id,
        content,
        created_at,
        author:users!author_id(id, name, avatar_url)
      `
      )
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    // Map Supabase join arrays to single objects
    const comments: SessionCommentWithAuthor[] = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      author: Array.isArray(c.author) ? c.author[0] : c.author,
    })) as SessionCommentWithAuthor[];

    return { success: true, data: comments };
  } catch (error) {
    logError(error, { action: 'fetchSessionComments', sessionId });
    return { success: false, error: 'Failed to fetch session comments' };
  }
}

/** Insert a new session comment */
export async function insertSessionComment(
  supabase: SupabaseClient,
  sessionId: string,
  authorId: string,
  content: string
): Promise<DalResult<SessionCommentWithAuthor>> {
  try {
    const { data: newComment, error: insertError } = await supabase
      .from('session_comments')
      .insert({ session_id: sessionId, author_id: authorId, content })
      .select(
        `
        id,
        session_id,
        author_id,
        content,
        created_at,
        author:users!author_id(id, name, avatar_url)
      `
      )
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    const comment: SessionCommentWithAuthor = {
      ...newComment,
      author: Array.isArray(newComment.author) ? newComment.author[0] : newComment.author,
    } as SessionCommentWithAuthor;

    return { success: true, data: comment };
  } catch (error) {
    logError(error, { action: 'insertSessionComment', sessionId });
    return { success: false, error: 'Failed to insert session comment' };
  }
}

/** Delete a session comment by ID */
export async function deleteSessionComment(supabase: SupabaseClient, commentId: string): Promise<DalResult<null>> {
  try {
    const { error: deleteError } = await supabase.from('session_comments').delete().eq('id', commentId);

    if (deleteError) {
      return { success: false, error: deleteError.message };
    }

    return { success: true };
  } catch (error) {
    logError(error, { action: 'deleteSessionComment', commentId });
    return { success: false, error: 'Failed to delete session comment' };
  }
}
