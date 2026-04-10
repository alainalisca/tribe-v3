/** DAL: Strava segment routes caching and queries */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface StravaRoute {
  id: string;
  strava_segment_id: string;
  name: string;
  sport: 'Running' | 'Cycling';
  distance_meters: number;
  elevation_gain: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  polyline: string | null;
  athlete_count: number;
  star_count: number;
  city: string;
  cached_at: string;
  expires_at: string;
}

/**
 * Fetch Strava routes within ~10km of a given coordinate.
 * Respects cache expiry (7-day TTL).
 */
export async function fetchNearbyRoutes(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  sport?: 'Running' | 'Cycling',
  limit = 10
): Promise<DalResult<StravaRoute[]>> {
  try {
    let query = supabase
      .from('strava_routes')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('star_count', { ascending: false })
      .limit(limit);

    if (sport) {
      query = query.eq('sport', sport);
    }

    const { data, error } = await query;

    if (error) return { success: false, error: error.message };

    // Filter by distance (~10km radius from start point)
    const EARTH_RADIUS_KM = 6371;
    const MAX_DISTANCE_KM = 10;

    const filtered = (data || []).filter((route) => {
      const dLat = ((route.start_lat - lat) * Math.PI) / 180;
      const dLng = ((route.start_lng - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((route.start_lat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = EARTH_RADIUS_KM * c;
      return distance <= MAX_DISTANCE_KM;
    });

    return { success: true, data: filtered };
  } catch (error) {
    logError(error, { action: 'fetchNearbyRoutes', lat, lng, sport });
    return { success: false, error: 'Failed to fetch routes' };
  }
}

/**
 * Bulk upsert Strava routes into strava_routes table.
 * Handles conflicts on strava_segment_id.
 */
export async function upsertRoutes(
  supabase: SupabaseClient,
  routes: Omit<StravaRoute, 'id'>[]
): Promise<DalResult<StravaRoute[]>> {
  try {
    if (routes.length === 0) {
      return { success: true, data: [] };
    }

    const { data, error } = await supabase
      .from('strava_routes')
      .upsert(routes, { onConflict: 'strava_segment_id' })
      .select();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'upsertRoutes' });
    return { success: false, error: 'Failed to upsert routes' };
  }
}
