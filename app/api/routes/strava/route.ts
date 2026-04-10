import { createClient } from '@/lib/supabase/server';
import { upsertRoutes, fetchNearbyRoutes } from '@/lib/dal/stravaRoutes';
import { NextResponse, NextRequest } from 'next/server';
import { logError } from '@/lib/logger';

/**
 * @description Fetches popular Strava segments (running/cycling routes) with caching.
 * Checks cache freshness (7-day TTL) and queries Strava API if stale.
 *
 * To set up Strava access:
 * 1. Register at strava.com/settings/api
 * 2. Create an OAuth application to get client_id and client_secret
 * 3. Exchange credentials for an access token via the Strava OAuth2 flow
 * 4. Set STRAVA_ACCESS_TOKEN in .env.local with the access token
 *
 * @method GET
 * @auth Required - validates the caller is authenticated via Supabase auth.
 * @param {string} request.searchParams.lat - Latitude coordinate (required).
 * @param {string} request.searchParams.lng - Longitude coordinate (required).
 * @param {string} request.searchParams.sport - Filter by sport: Running|Cycling (optional).
 * @param {number} request.searchParams.limit - Max results (default: 10, max: 20).
 * @returns {Array} Array of StravaRoute objects.
 */
export async function GET(request: NextRequest) {
  try {
    // AUTH: prevent bots from exhausting API quota
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat') || '');
    const lng = parseFloat(searchParams.get('lng') || '');
    const sport = searchParams.get('sport') as 'Running' | 'Cycling' | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'Missing or invalid lat/lng' }, { status: 400 });
    }

    // Check cache first
    const cachedResult = await fetchNearbyRoutes(supabase, lat, lng, sport || undefined, limit);
    if (cachedResult.success && cachedResult.data && cachedResult.data.length > 0) {
      return NextResponse.json({ routes: cachedResult.data, fromCache: true });
    }

    // Cache miss or stale — fetch from Strava if token available
    const stravaToken = process.env.STRAVA_ACCESS_TOKEN;
    if (!stravaToken) {
      // Return cached-only results or empty array
      return NextResponse.json({
        routes: cachedResult.data || [],
        fromCache: true,
        message: 'Strava integration not configured. Returning cached results.',
      });
    }

    try {
      // Calculate bounding box from lat/lng with ~15km radius
      const radius = 0.15; // degrees (roughly 15km)
      const boundsStr = `${lat - radius},${lng - radius},${lat + radius},${lng + radius}`;

      // Determine activity type for Strava API
      const activityType = sport === 'Cycling' ? 'ride' : 'run';

      const url = new URL('https://www.strava.com/api/v3/segments/explore');
      url.searchParams.set('bounds', boundsStr);
      url.searchParams.set('activity_type', activityType);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${stravaToken}`,
        },
      });

      if (!response.ok) {
        logError(new Error(`Strava API returned ${response.status}`), {
          action: 'strava_segments_explore',
        });
        // Return cached results if API fails
        return NextResponse.json({
          routes: cachedResult.data || [],
          fromCache: true,
          message: 'Strava API unavailable. Returning cached results.',
        });
      }

      const data = await response.json();
      const segments = data.segments || [];

      const routesArray = segments.slice(0, limit).map(
        (segment: Record<string, unknown>) => ({
          strava_segment_id: segment.id?.toString() || '',
          name: segment.name as string,
          sport: activityType === 'ride' ? 'Cycling' : 'Running',
          distance_meters: Math.round((segment.distance as number) * 1000) || 0, // Convert km to meters
          elevation_gain: Math.round((segment.elevation_high as number) - (segment.elevation_low as number)) || 0,
          start_lat: segment.start_latitude as number,
          start_lng: segment.start_longitude as number,
          end_lat: segment.end_latitude as number,
          end_lng: segment.end_longitude as number,
          polyline: segment.polyline as string | null,
          athlete_count: (segment.athlete_count as number) || 0,
          star_count: (segment.starred_count as number) || 0,
          city: segment.city as string,
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        []
      );

      if (routesArray.length > 0) {
        await upsertRoutes(supabase, routesArray);
      }

      return NextResponse.json({ routes: routesArray, fromCache: false });
    } catch (error) {
      logError(error, { action: 'strava_api_query' });
      // Return cached results if Strava query fails
      return NextResponse.json({
        routes: cachedResult.data || [],
        fromCache: true,
        message: 'Strava query failed. Returning cached results.',
      });
    }
  } catch (error) {
    logError(error, { route: '/api/routes/strava', action: 'fetch_strava_routes' });
    return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 });
  }
}
