import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchNearbyExternalEvents, upsertExternalEvents, type ExternalEventInsert } from '@/lib/dal/externalEvents';
import { logError } from '@/lib/logger';

/**
 * Maps keywords in event title/description to Tribe sports
 */
function detectSport(title: string, description: string = ''): string {
  const text = `${title} ${description}`.toLowerCase();

  const sportPatterns: Record<string, string[]> = {
    running: ['run', '5k', '10k', 'marathon', 'trail run'],
    cycling: ['bike', 'cycling', 'cycle', 'mtb', 'road bike'],
    hiking: ['hike', 'hiking', 'trail', 'trek', 'backpack'],
    yoga: ['yoga', 'pilates'],
    crossfit: ['crossfit', 'cross-fit', 'wod', 'functional fitness'],
    soccer: ['soccer', 'football', 'futbol'],
    swimming: ['swim', 'swimming', 'pool', 'water sports'],
    fitness: ['gym', 'workout', 'training', 'bootcamp', 'zumba', 'dance'],
  };

  for (const [sport, keywords] of Object.entries(sportPatterns)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return sport;
    }
  }

  return 'fitness'; // Default fallback
}

interface EventbriteEvent {
  id: string;
  name: {
    text: string;
    html?: string;
  };
  description?: {
    text: string;
  };
  url: string;
  logo?: {
    crop_mask?: {
      top_left?: {
        x: number;
        y: number;
      };
      top_right?: {
        x: number;
        y: number;
      };
      bottom_left?: {
        x: number;
        y: number;
      };
      bottom_right?: {
        x: number;
        y: number;
      };
    };
    original?: {
      url: string;
    };
  };
  start: {
    utc: string;
    timezone?: string;
  };
  end: {
    utc: string;
  };
  status: string;
}

interface EventbriteVenue {
  latitude: number;
  longitude: number;
  name: string;
  address?: {
    city?: string;
  };
}

interface EventbriteSearchResponse {
  events?: Array<{
    id: string;
    name: {
      text: string;
    };
    description?: {
      text: string;
    };
    url: string;
    logo?: {
      original?: {
        url: string;
      };
    };
    start: {
      utc: string;
    };
    end: {
      utc: string;
    };
    status: string;
    venue_id?: string;
  }>;
  venues?: Record<string, EventbriteVenue>;
  pagination?: {
    has_more_items: boolean;
    page_count: number;
  };
}

/**
 * GET /api/events/eventbrite?lat=40.7128&lng=-74.0060&radius=25
 *
 * Fetches fitness and wellness events from Eventbrite within a radius.
 * Requires EVENTBRITE_API_KEY env var:
 * - Get it from: https://www.eventbrite.com/platform/api/
 * - Create an app and generate an OAuth token
 *
 * If no API key is set, returns cached events only.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lat = parseFloat(searchParams.get('lat') || '0');
    const lng = parseFloat(searchParams.get('lng') || '0');
    const radius = parseFloat(searchParams.get('radius') || '25');

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    // Initialize Supabase client (server-side)
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const apiKey = process.env.EVENTBRITE_API_KEY;

    if (!apiKey) {
      // Return cached events only
      const cached = await fetchNearbyExternalEvents(supabase, lat, lng, radius, undefined, 50);

      return NextResponse.json({
        success: true,
        events: cached.data || [],
        source: 'cache',
        note: 'EVENTBRITE_API_KEY not configured. Returning cached events only.',
      });
    }

    // Query Eventbrite REST API for Sports & Fitness and Health & Wellness events
    // Categories: 108 (Sports & Fitness), 107 (Health & Wellness)
    const eventbriteUrl = new URL('https://www.eventbriteapi.com/v3/events/search/');
    eventbriteUrl.searchParams.set('location.latitude', lat.toString());
    eventbriteUrl.searchParams.set('location.longitude', lng.toString());
    eventbriteUrl.searchParams.set('location.within', `${radius}km`);
    eventbriteUrl.searchParams.set('categories', '108,107'); // Sports & Fitness, Health & Wellness
    eventbriteUrl.searchParams.set('status', 'live');
    eventbriteUrl.searchParams.set('expand', 'venue,organizer');
    eventbriteUrl.searchParams.set('page_size', '50');
    eventbriteUrl.searchParams.set('sort_by', 'distance');

    const eventbriteResponse = await fetch(eventbriteUrl.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!eventbriteResponse.ok) {
      logError(new Error(`Eventbrite API error: ${eventbriteResponse.statusText}`), {
        action: 'fetchEventbriteEvents',
      });
      // Return cached events on API error
      const cached = await fetchNearbyExternalEvents(supabase, lat, lng, radius, undefined, 50);
      return NextResponse.json({
        success: true,
        events: cached.data || [],
        source: 'cache',
        note: 'Eventbrite API error. Returning cached events.',
      });
    }

    const eventbriteData: EventbriteSearchResponse = await eventbriteResponse.json();

    // Parse Eventbrite events and transform to ExternalEvent format
    const externalEvents: ExternalEventInsert[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const events = eventbriteData.events || [];
    const venues = eventbriteData.venues || {};

    for (const event of events) {
      // Only include live events
      if (event.status !== 'live') continue;

      const venue = event.venue_id ? venues[event.venue_id] : null;
      const venue_lat = venue?.latitude || lat;
      const venue_lng = venue?.longitude || lng;
      const location_name = venue?.name || venue?.address?.city || 'Unknown';

      const description = event.description?.text || '';
      const sport = detectSport(event.name.text, description);

      externalEvents.push({
        source: 'eventbrite',
        external_id: event.id,
        title: event.name.text,
        description: description || null,
        sport,
        location_lat: venue_lat,
        location_lng: venue_lng,
        location_name,
        event_url: event.url,
        image_url: event.logo?.original?.url || null,
        start_time: new Date(event.start.utc).toISOString(),
        end_time: event.end ? new Date(event.end.utc).toISOString() : null,
        participant_count: null, // Eventbrite doesn't provide RSVP count in search API
        organizer_name: null, // Would need additional request to get organizer name
        cached_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });
    }

    // Upsert into database
    if (externalEvents.length > 0) {
      await upsertExternalEvents(supabase, externalEvents);
    }

    return NextResponse.json({
      success: true,
      events: externalEvents,
      source: 'eventbrite',
      count: externalEvents.length,
    });
  } catch (error) {
    logError(error, { action: 'eventbriteRoute' });
    return NextResponse.json({ error: 'Failed to fetch Eventbrite events' }, { status: 500 });
  }
}
