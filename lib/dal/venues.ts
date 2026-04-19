/** DAL: Google Places popular venues caching and queries */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface PopularVenue {
  id: string;
  place_id: string;
  name: string;
  category: 'gym' | 'park' | 'pool' | 'studio' | 'track' | 'trail' | 'box' | 'other';
  location_lat: number;
  location_lng: number;
  address: string;
  rating: number | null;
  photo_url: string | null;
  suggested_sports: string[];
  cached_at: string;
  expires_at: string;
}

/**
 * Fetch venues within ~10km of a given coordinate.
 * Respects cache expiry (7-day TTL).
 */
export async function fetchNearbyVenues(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  category?: string,
  limit = 10
): Promise<DalResult<PopularVenue[]>> {
  try {
    let query = supabase
      .from('popular_venues')
      .select('id, place_id, name, category, location_lat, location_lng, address, rating, photo_url, suggested_sports, cached_at, expires_at')
      .gt('expires_at', new Date().toISOString())
      .order('rating', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) return { success: false, error: error.message };

    // Filter by distance (~10km radius)
    const EARTH_RADIUS_KM = 6371;
    const MAX_DISTANCE_KM = 10;

    const filtered = (data || []).filter((venue) => {
      const dLat = ((venue.location_lat - lat) * Math.PI) / 180;
      const dLng = ((venue.location_lng - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((venue.location_lat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = EARTH_RADIUS_KM * c;
      return distance <= MAX_DISTANCE_KM;
    });

    return { success: true, data: filtered };
  } catch (error) {
    logError(error, { action: 'fetchNearbyVenues', lat, lng });
    return { success: false, error: 'Failed to fetch venues' };
  }
}

/**
 * Bulk upsert venues into popular_venues table.
 * Handles conflicts on place_id.
 */
export async function upsertVenues(
  supabase: SupabaseClient,
  venues: Omit<PopularVenue, 'id'>[]
): Promise<DalResult<PopularVenue[]>> {
  try {
    if (venues.length === 0) {
      return { success: true, data: [] };
    }

    const { data, error } = await supabase.from('popular_venues').upsert(venues, { onConflict: 'place_id' }).select();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, { action: 'upsertVenues' });
    return { success: false, error: 'Failed to upsert venues' };
  }
}
