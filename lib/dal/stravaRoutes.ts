/** DAL: Popular routes — curated Medellín running, cycling, and hiking routes */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface PopularRoute {
  id: string;
  name: string;
  sport_type: 'running' | 'cycling' | 'hiking';
  distance_km: number;
  elevation_gain_m: number;
  difficulty: 'easy' | 'moderate' | 'hard';
  start_lat: number;
  start_lng: number;
  description_en: string | null;
  description_es: string | null;
  image_url: string | null;
  is_active: boolean;
  submitted_by: string | null;
  created_at: string;
}

/**
 * Fetch curated popular routes, optionally filtered by sport type.
 * Routes are ordered alphabetically by name.
 */
export async function fetchPopularRoutes(
  supabase: SupabaseClient,
  sport?: string,
  limit: number = 15
): Promise<DalResult<PopularRoute[]>> {
  try {
    let query = supabase
      .from('popular_routes')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(limit);

    if (sport) {
      query = query.eq('sport_type', sport);
    }

    const { data, error } = await query;

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as PopularRoute[]) || [] };
  } catch (error) {
    logError(error, { action: 'fetchPopularRoutes', sport });
    return { success: false, error: 'Failed to fetch popular routes' };
  }
}
