/** DAL: community_news — read-only news articles for the Community News tab */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface CommunityNewsArticle {
  id: string;
  title: string;
  title_es: string | null;
  summary: string;
  summary_es: string | null;
  body_url: string;
  image_url: string | null;
  source: string;
  category: string;
  published_at: string;
  is_active: boolean;
  created_at: string;
}

export type NewsCategory = 'general' | 'running' | 'cycling' | 'fitness' | 'events' | 'health';

/**
 * Fetch active community news articles, optionally filtered by category.
 * Results are ordered by published_at DESC (newest first).
 */
export async function fetchCommunityNews(
  supabase: SupabaseClient,
  category?: string,
  limit: number = 20
): Promise<DalResult<CommunityNewsArticle[]>> {
  try {
    let query = supabase
      .from('community_news')
      .select('*')
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'fetchCommunityNews' });
    return { success: false, error: 'Failed to fetch community news' };
  }
}
