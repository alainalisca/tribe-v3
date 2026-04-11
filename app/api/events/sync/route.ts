import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { fetchNearbyExternalEvents, isCacheFresh, type ExternalEvent } from '@/lib/dal/externalEvents';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

/**
 * GET /api/events/sync?lat=40.7128&lng=-74.0060&radius=25&sport=running
 *
 * Combined sync endpoint for external events.
 * - Checks if cache is fresh (events cached within last 6 hours for this area)
 * - If stale, calls both Meetup and Eventbrite APIs in parallel
 * - Returns combined results sorted by start_time
 *
 * This is what the frontend calls — single endpoint, handles all sources.
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

    // Rate limit
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const { allowed } = rateLimit(ip, { maxRequests: 20, windowMs: 60_000 });
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

    if (freshCheck.success && freshCheck.data) {
      // Cache is fresh, return cached results
      const cached = await fetchNearbyExternalEvents(supabase, lat, lng, radius, sport, limit);

      if (cached.success) {
        allEvents = cached.data || [];
      }

      return NextResponse.json({
        success: true,
        events: allEvents,
        source: 'cache',
        cacheAge: 'fresh',
        count: allEvents.length,
      });
    }

    // Cache is stale or empty, fetch from both APIs in parallel
    const [meetupResult, eventbriteResult] = await Promise.allSettled([
      fetch(new URL(`/api/events/meetup?lat=${lat}&lng=${lng}&radius=${radius}`, request.nextUrl.origin).toString()),
      fetch(
        new URL(`/api/events/eventbrite?lat=${lat}&lng=${lng}&radius=${radius}`, request.nextUrl.origin).toString()
      ),
    ]);

    // Parse results (suppress errors, fall back to cache if API call fails)
    let meetupEvents: ExternalEvent[] = [];
    let eventbriteEvents: ExternalEvent[] = [];

    if (meetupResult.status === 'fulfilled' && meetupResult.value.ok) {
      try {
        const data = await meetupResult.value.json();
        meetupEvents = data.events || [];
      } catch (error) {
        logError(error, { action: 'syncMeetupParse' });
      }
    }

    if (eventbriteResult.status === 'fulfilled' && eventbriteResult.value.ok) {
      try {
        const data = await eventbriteResult.value.json();
        eventbriteEvents = data.events || [];
      } catch (error) {
        logError(error, { action: 'syncEventbriteParse' });
      }
    }

    // Combine and deduplicate events by (source, external_id)
    const eventMap = new Map<string, ExternalEvent>();
    for (const event of [...meetupEvents, ...eventbriteEvents]) {
      const key = `${event.source}:${event.external_id}`;
      eventMap.set(key, event);
    }

    allEvents = Array.from(eventMap.values());

    // Filter by sport if provided
    if (sport) {
      allEvents = allEvents.filter((e) => e.sport === sport);
    }

    // Sort by start_time
    allEvents.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // Limit results
    allEvents = allEvents.slice(0, limit);

    return NextResponse.json({
      success: true,
      events: allEvents,
      source: 'live',
      cacheAge: 'refreshed',
      count: allEvents.length,
    });
  } catch (error) {
    logError(error, { action: 'syncRoute' });
    return NextResponse.json({ error: 'Failed to sync external events' }, { status: 500 });
  }
}
