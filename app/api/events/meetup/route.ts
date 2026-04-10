import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchNearbyExternalEvents, upsertExternalEvents, type ExternalEventInsert } from '@/lib/dal/externalEvents';
import { logError } from '@/lib/logger';

/**
 * Maps Meetup category IDs to Tribe sports
 * https://www.meetup.com/api/schema/#/schemas/CategoryBasic
 */
const MEETUP_CATEGORY_TO_SPORT: Record<number, string> = {
  8: 'running', // Running
  4: 'cycling', // Cycling
  13: 'hiking', // Hiking
  14: 'yoga', // Yoga
  9: 'crossfit', // Sports
  25: 'sports', // General sports
  27: 'fitness', // Fitness
  28: 'swimming', // Water sports
  33: 'soccer', // Team sports
};

interface MeetupGroup {
  id: number;
  name: string;
  category?: {
    id: number;
    name: string;
  };
  lat?: number;
  lon?: number;
  city?: string;
}

interface MeetupEvent {
  id: string;
  title: string;
  description?: string;
  dateTime: string;
  duration?: number;
  group: MeetupGroup;
  eventUrl: string;
  featured_photo?: {
    photo_link: string;
  };
  yes_rsvp_count?: number;
}

interface MeetupGraphQLResponse {
  data?: {
    groupSearch?: {
      edges?: Array<{
        node?: {
          id: string;
          name: string;
          category?: {
            id: number;
            name: string;
          };
          lat?: number;
          lon?: number;
          city?: string;
          upcomingEvents?: {
            edges?: Array<{
              node?: MeetupEvent;
            }>;
          };
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * GET /api/events/meetup?lat=40.7128&lng=-74.0060&radius=25
 *
 * Fetches fitness-related events from Meetup within a radius.
 * Requires MEETUP_API_KEY env var:
 * - Get it from: https://www.meetup.com/api/consulting/#getting-started
 * - Sign in with Meetup account, create an OAuth consumer
 * - Get your API key from the settings
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

    const apiKey = process.env.MEETUP_API_KEY;

    if (!apiKey) {
      // Return cached events only
      const cached = await fetchNearbyExternalEvents(supabase, lat, lng, radius, undefined, 50);

      return NextResponse.json({
        success: true,
        events: cached.data || [],
        source: 'cache',
        note: 'MEETUP_API_KEY not configured. Returning cached events only.',
      });
    }

    // Fetch from Meetup GraphQL API
    const graphqlQuery = `
      query {
        groupSearch(input: {
          first: 20
          lat: ${lat}
          lon: ${lng}
          radiusMiles: ${radius * 0.621371}
          categoryIds: [${Object.keys(MEETUP_CATEGORY_TO_SPORT).join(', ')}]
          sortByDistanceFirst: true
        }) {
          edges {
            node {
              id
              name
              category {
                id
                name
              }
              lat
              lon
              city
              upcomingEvents(input: { first: 10 }) {
                edges {
                  node {
                    id
                    title
                    description
                    dateTime
                    duration
                    eventUrl
                    featured_photo {
                      photo_link
                    }
                    yes_rsvp_count
                  }
                }
              }
            }
          }
        }
      }
    `;

    const meetupResponse = await fetch('https://api.meetup.com/gql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });

    if (!meetupResponse.ok) {
      logError(new Error(`Meetup API error: ${meetupResponse.statusText}`), { action: 'fetchMeetupEvents' });
      // Return cached events on API error
      const cached = await fetchNearbyExternalEvents(supabase, lat, lng, radius, undefined, 50);
      return NextResponse.json({
        success: true,
        events: cached.data || [],
        source: 'cache',
        note: 'Meetup API error. Returning cached events.',
      });
    }

    const meetupData: MeetupGraphQLResponse = await meetupResponse.json();

    if (meetupData.errors) {
      logError(new Error(`Meetup GraphQL error: ${meetupData.errors[0].message}`), { action: 'fetchMeetupEvents' });
      // Return cached events on API error
      const cached = await fetchNearbyExternalEvents(supabase, lat, lng, radius, undefined, 50);
      return NextResponse.json({
        success: true,
        events: cached.data || [],
        source: 'cache',
        note: 'Meetup API error. Returning cached events.',
      });
    }

    // Parse Meetup events and transform to ExternalEvent format
    const externalEvents: ExternalEventInsert[] = [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const groups = meetupData.data?.groupSearch?.edges || [];
    for (const groupEdge of groups) {
      const group = groupEdge.node;
      if (!group) continue;

      const sport = (group.category && MEETUP_CATEGORY_TO_SPORT[group.category.id]) || 'fitness';

      const events = group.upcomingEvents?.edges || [];
      for (const eventEdge of events) {
        const event = eventEdge.node;
        if (!event || !event.dateTime) continue;

        externalEvents.push({
          source: 'meetup',
          external_id: event.id,
          title: event.title,
          description: event.description || null,
          sport,
          location_lat: group.lat || lat,
          location_lng: group.lon || lng,
          location_name: group.city || 'Unknown',
          event_url: event.eventUrl,
          image_url: event.featured_photo?.photo_link || null,
          start_time: new Date(event.dateTime).toISOString(),
          end_time: event.duration
            ? new Date(new Date(event.dateTime).getTime() + event.duration * 60 * 1000).toISOString()
            : null,
          participant_count: event.yes_rsvp_count || null,
          organizer_name: group.name || null,
          cached_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        });
      }
    }

    // Upsert into database
    if (externalEvents.length > 0) {
      await upsertExternalEvents(supabase, externalEvents);
    }

    return NextResponse.json({
      success: true,
      events: externalEvents,
      source: 'meetup',
      count: externalEvents.length,
    });
  } catch (error) {
    logError(error, { action: 'meetupRoute' });
    return NextResponse.json({ error: 'Failed to fetch Meetup events' }, { status: 500 });
  }
}
