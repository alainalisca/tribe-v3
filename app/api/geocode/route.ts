import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

/**
 * @description Reverse geocodes latitude/longitude coordinates into a human-readable address using the Google Geocoding API.
 * @method GET
 * @auth Required - validates the caller is authenticated via Supabase auth to prevent quota abuse.
 * @param {string} request.searchParams.lat - Latitude coordinate.
 * @param {string} request.searchParams.lon - Longitude coordinate.
 * @returns {{ display_name: string | null, lat: string, lon: string }} The formatted address and echoed coordinates.
 */
export async function GET(request: Request) {
  // AUTH: prevent bots from exhausting Google geocoding quota
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Missing lat/lon' }, { status: 400 });
  }

  // Prefer the server-only key (not exposed to client bundles).
  // Falls back to the public key during migration — once GOOGLE_MAPS_SERVER_KEY
  // is set in .env.local, remove the NEXT_PUBLIC_ fallback.
  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${key}`);

    if (!response.ok) {
      throw new Error(`Geocoding HTTP ${response.status}`);
    }

    const data = await response.json();

    // GOOGLE RETURNS HTTP 200 FOR ITS OWN FAILURES. A rejected key comes back
    // as 200 with {"status":"REQUEST_DENIED","results":[]}, so `response.ok`
    // is true and `results[0]` is undefined -- indistinguishable from "there
    // is no address at these coordinates" unless `status` is read.
    //
    // The previous version did not read it. It returned display_name: null
    // with a 24-hour cache header, logged nothing, and answered 200. So a key
    // misconfiguration became a silent, edge-cached, day-long outage in which
    // every caller believed Google simply had no name for the place.
    const status: string = data.status ?? 'UNKNOWN_ERROR';

    // ZERO_RESULTS is a real answer: Google looked and there is nothing there.
    // It is the ONLY empty result worth caching.
    if (status === 'ZERO_RESULTS') {
      return NextResponse.json(
        { display_name: null, lat, lon },
        { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
      );
    }

    if (status !== 'OK') {
      // REQUEST_DENIED   -> key rejected: wrong key, or API restrictions that
      //                     exclude server-side use. A referrer-restricted key
      //                     ALWAYS fails here, because there is no referrer.
      // OVER_QUERY_LIMIT -> billing or rate ceiling reached.
      // Both are our misconfiguration, not a property of the coordinates, and
      // both must be loud.
      logError(new Error(`Google geocoding returned ${status}`), {
        route: '/api/geocode',
        action: 'reverse_geocode',
        status,
        // error_message carries Google's explanation. It never contains the
        // key -- the key is a request parameter, not part of the response.
        detail: data.error_message ?? null,
        usingServerKey: Boolean(process.env.GOOGLE_MAPS_SERVER_KEY),
      });
      return NextResponse.json(
        { error: 'Geocoding unavailable' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const result = data.results?.[0];
    return NextResponse.json(
      { display_name: result?.formatted_address || null, lat, lon },
      { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
    );
  } catch (error) {
    logError(error, { route: '/api/geocode', action: 'reverse_geocode' });
    // NEVER cache a failure. The old handler cached success-shaped failures for
    // a day; this one keeps every error path out of the edge cache entirely.
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
