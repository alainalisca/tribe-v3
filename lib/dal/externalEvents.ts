/** DAL: external_events table (Meetup, Eventbrite, Strava events) */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface ExternalEvent {
  id: string;
  source: 'meetup' | 'eventbrite' | 'strava';
  external_id: string;
  title: string;
  description: string | null;
  sport: string;
  location_lat: number;
  location_lng: number;
  location_name: string;
  event_url: string;
  image_url: string | null;
  start_time: string; // ISO 8601 timestamp
  end_time: string | null; // ISO 8601 timestamp
  participant_count: number | null;
  organizer_name: string | null;
  cached_at: string; // ISO 8601 timestamp
  expires_at: string; // ISO 8601 timestamp
}

export interface ExternalEventInsert extends Omit<ExternalEvent, 'id' | 'cached_at'> {
  cached_at?: string;
}

/**
 * Fetches nearby external events within a radius, not expired, ordered by start_time.
 * Uses Haversine formula for distance calculation.
 */
export async function fetchNearbyExternalEvents(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  radiusKm: number = 25,
  sport?: string,
  limit: number = 50
): Promise<DalResult<ExternalEvent[]>> {
  try {
    let query = supabase
      .from('external_events')
      .select('*')
      .lte('expires_at', new Date().toISOString())
      .order('start_time', { ascending: true });

    // Apply sport filter if provided
    if (sport) {
      query = query.eq('sport', sport);
    }

    // Fetch all events and filter by distance in JS
    // Note: Supabase doesn't support Haversine natively in RLS contexts
    const { data, error } = await query.limit(500);

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: true, data: [] };
    }

    // Filter by distance using Haversine formula
    const nearbyEvents = data.filter((event) => {
      const distance = calculateHaversineDistance(lat, lng, event.location_lat, event.location_lng);
      return distance <= radiusKm;
    });

    // Return limited results
    return { success: true, data: nearbyEvents.slice(0, limit) };
  } catch (error) {
    logError(error, {
      action: 'fetchNearbyExternalEvents',
      lat,
      lng,
      radiusKm,
    });
    return { success: false, error: 'Failed to fetch nearby external events' };
  }
}

/**
 * Bulk upsert external events into the table.
 * Uses conflict on (source, external_id) to update if exists.
 */
export async function upsertExternalEvents(
  supabase: SupabaseClient,
  events: ExternalEventInsert[]
): Promise<DalResult<ExternalEvent[]>> {
  try {
    if (events.length === 0) {
      return { success: true, data: [] };
    }

    // Set cached_at to now if not provided
    const eventsWithCachedAt = events.map((event) => ({
      ...event,
      cached_at: event.cached_at || new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('external_events')
      .upsert(eventsWithCachedAt, {
        onConflict: 'source,external_id',
      })
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    logError(error, {
      action: 'upsertExternalEvents',
      count: events.length,
    });
    return { success: false, error: 'Failed to upsert external events' };
  }
}

/**
 * Deletes all events past their expires_at timestamp.
 */
export async function cleanExpiredEvents(supabase: SupabaseClient): Promise<DalResult<number>> {
  try {
    const { error, count } = await supabase.from('external_events').delete().lt('expires_at', new Date().toISOString());

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: count || 0 };
  } catch (error) {
    logError(error, { action: 'cleanExpiredEvents' });
    return { success: false, error: 'Failed to clean expired events' };
  }
}

/**
 * Check if cache is fresh for a given location.
 * Returns true if there are non-expired events cached within the last 6 hours.
 */
export async function isCacheFresh(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  radiusKm: number = 25
): Promise<DalResult<boolean>> {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('external_events')
      .select('id, location_lat, location_lng')
      .gte('cached_at', sixHoursAgo)
      .gt('expires_at', new Date().toISOString())
      .limit(1);

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: true, data: false };
    }

    // Check if any event is within radius
    const isFresh = data.some((event) => {
      const distance = calculateHaversineDistance(lat, lng, event.location_lat, event.location_lng);
      return distance <= radiusKm;
    });

    return { success: true, data: isFresh };
  } catch (error) {
    logError(error, {
      action: 'isCacheFresh',
      lat,
      lng,
    });
    return { success: false, error: 'Failed to check cache freshness' };
  }
}

/**
 * Haversine formula to calculate distance between two coordinates.
 * Returns distance in kilometers.
 */
function calculateHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
