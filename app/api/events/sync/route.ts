import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { fetchNearbyExternalEvents, isCacheFresh, type ExternalEvent } from '@/lib/dal/externalEvents';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/events/sync?lat=40.7128&lng=-74.0060&radius=25&sport=running
 *
 * Combined sync endpoint for external events (Eventbrite only).
 * - Checks if cache is fresh (events cached within last 6 hours for this area)
 * - If stale, calls Eventbrite API
 * - Auto-filters past events from results
 * - Returns results sorted by start_time
 *
 * This is what the frontend calls — single endpoint, handles all external sources.
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const authSupabase = await createAuthClient();
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit — keyed by user id, not IP, since this endpoint requires auth.
    const { allowed } = await checkRateLimit(authSupabase, `events-sync:${user.id}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const searchParams = request.nextUrl.searchParams;
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radius = parseFloat(searchParams.get('radius') || '25');
    const sport = searchParams.get('sport') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    // Initialize Supabase client (server-side)
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Check if cache is fresh
    const freshCheck = await isCacheFresh(supabase, lat, lng, radius);

    let allEvents: ExternalEvent[] = [];
    const now = new Date().toISOString();

    if (freshCheck.success && freshCheck.data) {
      // Cache is fresh, return cached results
      const cached = await fetchNearbyExternalEvents(supabase, lat, lng, radius, sport, limit);

      if (cached.success) {
        allEvents = (cached.data || []).filter((e) => e.start_time >= now);
      }

      return NextResponse.json(
        {
          success: true,
          events: allEvents,
          source: 'cache',
          cacheAge: 'fresh',
          count: allEvents.length,
        },
        {
          headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600' },
        }
      );
    }

    // Cache is stale or empty, fetch from Eventbrite API
    let eventbriteEvents: ExternalEvent[] = [];

    try {
      const eventbriteResponse = await fetch(
        new URL(`/api/events/eventbrite?lat=${lat}&lng=${lng}&radius=${radius}`, request.nextUrl.origin).toString()
      );

      if (eventbriteResponse.ok) {
        const data = await eventbriteResponse.json();
        eventbriteEvents = data.events || [];
      }
    } catch (error) {
      logError(error, { action: 'syncEventbriteFetch' });
    }

    // Deduplicate events by (source, external_id)
    const eventMap = new Map<string, ExternalEvent>();
    for (const event of eventbriteEvents) {
      const key = `${event.source}:${event.external_id}`;
      eventMap.set(key, event);
    }

    allEvents = Array.from(eventMap.values());

    // Filter out past events
    allEvents = allEvents.filter((e) => e.start_time >= now);

    // Filter by sport if provided
    if (sport) {
      allEvents = allEvents.filter((e) => e.sport === sport);
    }

    // Sort by start_time
    allEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // Limit results
    allEvents = allEvents.slice(0, limit);

    return NextResponse.json(
      {
        success: true,
        events: allEvents,
        source: 'live',
        cacheAge: 'refreshed',
        count: allEvents.length,
      },
      {
        headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=21600' },
      }
    );
  } catch (error) {
    logError(error, { action: 'syncRoute' });
    return NextResponse.json({ error: 'Failed to sync external events' }, { status: 500 });
  }
}
