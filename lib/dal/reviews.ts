/** DAL: reviews table — dedicated review queries for instructor profiles, storefronts, and session pages */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

/** Review row with joined reviewer profile and session sport */
export interface ReviewWithReviewer {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  session_id: string;
  session_sport: string | null;
  reviewer: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

/** Aggregate rating distribution for an instructor */
export interface ReviewDistribution {
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  average: number;
  total: number;
}

/** Fetch a paginated list of reviews for a given instructor (host_id). */
export async function fetchReviewsByHost(
  supabase: SupabaseClient,
  hostId: string,
  limit: number = 10,
  offset: number = 0
): Promise<DalResult<{ reviews: ReviewWithReviewer[]; total: number }>> {
  try {
    const { count, error: countError } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('host_id', hostId);

    if (countError) return { success: false, error: countError.message };

    const { data, error } = await supabase
      .from('reviews')
      .select(
        `
        id,
        rating,
        comment,
        created_at,
        session_id,
        sessions:session_id(sport),
        reviewer:reviewer_id(id, name, avatar_url)
      `
      )
      .eq('host_id', hostId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { success: false, error: error.message };

    const reviews: ReviewWithReviewer[] = (data || []).map((row: Record<string, unknown>) => {
      const sessionRel = row.sessions as { sport: string | null } | null;
      const reviewerRel = row.reviewer as { id: string; name: string; avatar_url: string | null } | null;
      return {
        id: row.id as string,
        rating: row.rating as number,
        comment: (row.comment as string | null) ?? null,
        created_at: row.created_at as string,
        session_id: row.session_id as string,
        session_sport: sessionRel?.sport ?? null,
        reviewer: reviewerRel
          ? { id: reviewerRel.id, name: reviewerRel.name, avatar_url: reviewerRel.avatar_url }
          : null,
      };
    });

    return { success: true, data: { reviews, total: count ?? 0 } };
  } catch (error) {
    logError(error, { action: 'fetchReviewsByHost', hostId });
    return { success: false, error: 'Failed to fetch reviews' };
  }
}

/**
 * Fetch the star-rating distribution for an instructor.
 * Returns counts per star level plus computed average and total.
 */
export async function fetchReviewDistribution(
  supabase: SupabaseClient,
  hostId: string
): Promise<DalResult<ReviewDistribution>> {
  try {
    const { data, error } = await supabase.from('reviews').select('rating').eq('host_id', hostId);

    if (error) return { success: false, error: error.message };

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    const rows = (data || []) as Array<{ rating: number }>;
    for (const row of rows) {
      const r = row.rating as 1 | 2 | 3 | 4 | 5;
      if (r >= 1 && r <= 5) {
        distribution[r] = (distribution[r] || 0) + 1;
        sum += r;
      }
    }
    const total = rows.length;
    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;

    return { success: true, data: { distribution, average, total } };
  } catch (error) {
    logError(error, { action: 'fetchReviewDistribution', hostId });
    return { success: false, error: 'Failed to fetch review distribution' };
  }
}

/** Fetch all reviews associated with a specific session (usually at most one per reviewer). */
export async function fetchReviewsBySession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<DalResult<ReviewWithReviewer[]>> {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select(
        `
        id,
        rating,
        comment,
        created_at,
        session_id,
        sessions:session_id(sport),
        reviewer:reviewer_id(id, name, avatar_url)
      `
      )
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };

    const reviews: ReviewWithReviewer[] = (data || []).map((row: Record<string, unknown>) => {
      const sessionRel = row.sessions as { sport: string | null } | null;
      const reviewerRel = row.reviewer as { id: string; name: string; avatar_url: string | null } | null;
      return {
        id: row.id as string,
        rating: row.rating as number,
        comment: (row.comment as string | null) ?? null,
        created_at: row.created_at as string,
        session_id: row.session_id as string,
        session_sport: sessionRel?.sport ?? null,
        reviewer: reviewerRel
          ? { id: reviewerRel.id, name: reviewerRel.name, avatar_url: reviewerRel.avatar_url }
          : null,
      };
    });

    return { success: true, data: reviews };
  } catch (error) {
    logError(error, { action: 'fetchReviewsBySession', sessionId });
    return { success: false, error: 'Failed to fetch reviews for session' };
  }
}
