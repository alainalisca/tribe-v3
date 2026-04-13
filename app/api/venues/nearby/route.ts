import { createClient } from '@/lib/supabase/server';
import { upsertVenues, fetchNearbyVenues } from '@/lib/dal/venues';
import { NextResponse, NextRequest } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';

const nearbyVenuesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  category: z.string().optional(),
  radius: z.coerce.number().min(100).max(10000).optional(),
  limit: z.coerce.number().min(1).max(20).optional(),
});

/**
 * @description Fetches nearby venues (gyms, parks, studios, etc.) with Google Places integration.
 * Checks cache freshness (7-day TTL) and queries Google Places API if stale.
 * @method GET
 * @auth Required - validates the caller is authenticated via Supabase auth.
 * @param {string} request.searchParams.lat - Latitude coordinate (required).
 * @param {string} request.searchParams.lng - Longitude coordinate (required).
 * @param {string} request.searchParams.category - Filter by category: gym|park|pool|studio|track|trail|box|other (optional).
 * @param {number} request.searchParams.radius - Search radius in meters (default: 5000, max: 10000).
 * @param {number} request.searchParams.limit - Max results (default: 10, max: 20).
 * @returns {Array} Array of PopularVenue objects with distance calculated from user position.
 */
export async function GET(request: NextRequest) {
  try {
    // AUTH: prevent bots from exhausting Google Places quota
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = nearbyVenuesSchema.safeParse({
      lat: searchParams.get('lat'),
      lng: searchParams.get('lng'),
      category: searchParams.get('category') || undefined,
      radius: searchParams.get('radius') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const { lat, lng, category } = parsed.data;
    const radius = parsed.data.radius ?? 5000;
    const limit = parsed.data.limit ?? 10;

    // Check cache first
    const cachedResult = await fetchNearbyVenues(supabase, lat, lng, category, limit);
    if (cachedResult.success && cachedResult.data && cachedResult.data.length > 0) {
      // Calculate distance for each venue
      const withDistance = cachedResult.data.map((venue) => ({
        ...venue,
        distance_km: calculateDistance(lat, lng, venue.location_lat, venue.location_lng),
      }));
      return NextResponse.json({ venues: withDistance, fromCache: true }, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
      });
    }

    // Cache miss or stale — fetch from Google Places API
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
    }

    // Search for multiple types to build a comprehensive variety
    const searchQueries = [
      { keyword: 'gym', type: 'gym' },
      { keyword: 'fitness park', type: 'park' },
      { keyword: 'crossfit box', type: 'gym' },
      { keyword: 'yoga studio', type: 'studio' },
      { keyword: 'swimming pool', type: 'pool' },
      { keyword: 'public pool', type: 'pool' },
      { keyword: 'running track', type: 'track' },
      { keyword: 'tennis court', type: 'park' },
      { keyword: 'soccer field cancha', type: 'park' },
      { keyword: 'parque deportivo', type: 'park' },
      { keyword: 'calisthenics park', type: 'park' },
      { keyword: 'sports center centro deportivo', type: 'gym' },
      { keyword: 'martial arts gym', type: 'gym' },
      { keyword: 'dance studio', type: 'studio' },
      { keyword: 'climbing gym', type: 'gym' },
    ];

    // Group queries by category so we can take a balanced number from each
    const categoryQueries: Record<string, typeof searchQueries> = {};
    for (const query of searchQueries) {
      const cat = query.type;
      if (!categoryQueries[cat]) categoryQueries[cat] = [];
      categoryQueries[cat].push(query);
    }

    // Fetch each category's results separately for diversity
    const categoryResults: Record<string, Map<string, any>> = {};

    for (const [cat, queries] of Object.entries(categoryQueries)) {
      categoryResults[cat] = new Map();

      for (const query of queries) {
        try {
          const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
          url.searchParams.set('location', `${lat},${lng}`);
          url.searchParams.set('radius', radius.toString());
          url.searchParams.set('keyword', query.keyword);
          url.searchParams.set('key', apiKey);

          const response = await fetch(url.toString());
          if (!response.ok) continue;

          const data = await response.json();
          const results = data.results || [];

          for (const place of results) {
            if (!categoryResults[cat].has(place.place_id)) {
              const mapCategory = mapGoogleTypeToCategory(query.type);
              const suggestedSports = mapCategoryToSports(mapCategory);

              categoryResults[cat].set(place.place_id, {
                place_id: place.place_id,
                name: place.name,
                category: mapCategory,
                location_lat: place.geometry.location.lat,
                location_lng: place.geometry.location.lng,
                address: place.vicinity || '',
                rating: place.rating || null,
                photo_reference: place.photos?.[0]?.photo_reference || null,
                photo_url: place.photos?.[0]
                  ? `/api/venues/photo?ref=${encodeURIComponent(place.photos[0].photo_reference)}`
                  : null,
                suggested_sports: suggestedSports,
                cached_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });
            }
          }
        } catch (error) {
          logError(error, { action: 'google_places_query', query: query.keyword });
        }
      }
    }

    // Take top N from each category (sorted by rating), then interleave for diversity
    const categories = Object.keys(categoryResults);
    const perCategory = Math.max(2, Math.ceil(limit / categories.length));
    const categorySlices: any[][] = categories.map((cat) => {
      const venues = Array.from(categoryResults[cat].values());
      // Sort by rating descending, nulls last
      venues.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      return venues.slice(0, perCategory);
    });

    // Interleave: round-robin across categories for a mixed feed
    const seen = new Set<string>();
    const venuesArray: any[] = [];
    const maxSliceLen = Math.max(...categorySlices.map((s) => s.length), 0);
    for (let i = 0; i < maxSliceLen && venuesArray.length < limit; i++) {
      for (const slice of categorySlices) {
        if (i < slice.length && !seen.has(slice[i].place_id) && venuesArray.length < limit) {
          seen.add(slice[i].place_id);
          venuesArray.push(slice[i]);
        }
      }
    }

    if (venuesArray.length > 0) {
      await upsertVenues(supabase, venuesArray);
    }

    const withDistance = venuesArray.map((venue) => ({
      ...venue,
      distance_km: calculateDistance(lat, lng, venue.location_lat, venue.location_lng),
    }));

    return NextResponse.json({ venues: withDistance, fromCache: false }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    logError(error, { route: '/api/venues/nearby', action: 'fetch_nearby_venues' });
    return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 });
  }
}

/**
 * Calculate distance between two coordinates in km using Haversine formula.
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const EARTH_RADIUS_KM = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Map Google Places type to our category enum.
 */
function mapGoogleTypeToCategory(
  type: string
): 'gym' | 'park' | 'pool' | 'studio' | 'track' | 'trail' | 'box' | 'other' {
  const typeMap: Record<string, 'gym' | 'park' | 'pool' | 'studio' | 'track' | 'trail' | 'box' | 'other'> = {
    gym: 'gym',
    park: 'park',
    pool: 'pool',
    studio: 'studio',
    track: 'track',
    trail: 'trail',
    box: 'box',
  };
  return typeMap[type] || 'other';
}

/**
 * Map category to suggested sports for display.
 */
function mapCategoryToSports(category: string): string[] {
  const sportMap: Record<string, string[]> = {
    gym: ['Strength Training', 'CrossFit', 'Boxing'],
    park: ['Running', 'Yoga', 'Calisthenics'],
    pool: ['Swimming'],
    studio: ['Yoga', 'Pilates', 'Dance'],
    track: ['Running', 'Sprint Training'],
    trail: ['Trail Running', 'Hiking'],
    box: ['CrossFit', 'Boxing'],
    other: ['Fitness'],
  };
  return sportMap[category] || ['Fitness'];
}
