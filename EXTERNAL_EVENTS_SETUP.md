# External Event Aggregation System

This document explains the external event aggregation system for the Tribe fitness app, which solves the cold-start problem by aggregating real fitness events from Meetup and Eventbrite.

## Architecture Overview

The system consists of:

1. **DAL Layer** (`lib/dal/externalEvents.ts`) - Database abstraction for caching events
2. **API Routes** - Three endpoints for fetching and syncing events:
   - `/api/events/meetup` - Fetch from Meetup GraphQL API
   - `/api/events/eventbrite` - Fetch from Eventbrite REST API
   - `/api/events/sync` - Smart cache + combined endpoint (frontend calls this)
3. **Components** - UI for displaying external events:
   - `ExternalEventCard` - Single event card
   - `NearbyEvents` - Section with sport filters and horizontal scroll
4. **Database** - `external_events` table (migration 012)

## Setup Instructions

### Step 1: Environment Variables

Add these to your `.env.local`:

```bash
# Meetup API Key
# Get it from: https://www.meetup.com/api/consulting/#getting-started
# Sign in with Meetup account → Create OAuth consumer → Copy API key
MEETUP_API_KEY=your_meetup_api_key_here

# Eventbrite API Key
# Get it from: https://www.eventbrite.com/platform/api/
# Create app → Generate OAuth token
EVENTBRITE_API_KEY=your_eventbrite_api_key_here
```

### Step 2: Database Migration

The `external_events` table is created by migration 012. Verify it exists:

```sql
SELECT * FROM external_events LIMIT 0;
```

Schema:

```sql
CREATE TABLE external_events (
  id UUID PRIMARY KEY,
  source VARCHAR(20) NOT NULL, -- 'meetup' | 'eventbrite' | 'strava'
  external_id VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  sport VARCHAR(50) NOT NULL,
  location_lat DECIMAL(10, 8) NOT NULL,
  location_lng DECIMAL(11, 8) NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  event_url VARCHAR(500) NOT NULL,
  image_url VARCHAR(500),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  participant_count INTEGER,
  organizer_name VARCHAR(255),
  cached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  UNIQUE(source, external_id),
  INDEX(sport),
  INDEX(cached_at),
  INDEX(expires_at)
);

-- RLS: public read, server-role write
ALTER TABLE external_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON external_events
  FOR SELECT USING (true);

CREATE POLICY "server_write" ON external_events
  FOR INSERT, UPDATE, DELETE USING (
    auth.role() = 'service_role'
  );
```

### Step 3: Add to Frontend

In your home page component, import and use `NearbyEvents`:

```tsx
import NearbyEvents from '@/components/NearbyEvents';

export default function HomePage({ language }: { language: string }) {
  return (
    <div>
      {/* Other sections */}
      <NearbyEvents language={language} />
      {/* More sections */}
    </div>
  );
}
```

## API Endpoints

### GET /api/events/meetup

Fetch from Meetup GraphQL API.

**Parameters:**

- `lat` (number, required) - Latitude
- `lng` (number, required) - Longitude
- `radius` (number, optional, default 25) - Radius in kilometers

**Response:**

```json
{
  "success": true,
  "events": [
    {
      "id": "uuid",
      "source": "meetup",
      "external_id": "event123",
      "title": "Sunday Morning Run",
      "description": "Easy 5K run",
      "sport": "running",
      "location_lat": 40.7128,
      "location_lng": -74.006,
      "location_name": "Central Park",
      "event_url": "https://meetup.com/...",
      "image_url": "https://...",
      "start_time": "2026-04-12T08:00:00Z",
      "end_time": "2026-04-12T09:00:00Z",
      "participant_count": 24,
      "organizer_name": "NYC Runners",
      "cached_at": "2026-04-10T12:00:00Z",
      "expires_at": "2026-04-17T12:00:00Z"
    }
  ],
  "source": "meetup",
  "count": 1
}
```

**Error Handling:**

- If `MEETUP_API_KEY` is not set, returns cached events with a note
- If Meetup API fails, returns cached events gracefully
- Includes proper logging via `logError()`

### GET /api/events/eventbrite

Fetch from Eventbrite REST API.

**Parameters:**

- `lat` (number, required) - Latitude
- `lng` (number, required) - Longitude
- `radius` (number, optional, default 25) - Radius in kilometers

**Response:** Same format as `/api/events/meetup`

**Event Categories Used:**

- 108 - Sports & Fitness
- 107 - Health & Wellness

**Sports Detection:**
Uses keyword matching in title/description to categorize events:

- `running`: "run", "5k", "10k", "marathon", "trail run"
- `cycling`: "bike", "cycling", "mtb", "road bike"
- `hiking`: "hike", "hiking", "trail", "trek", "backpack"
- `yoga`: "yoga", "pilates"
- `crossfit`: "crossfit", "wod", "functional fitness"
- `soccer`: "soccer", "football", "futbol"
- `swimming`: "swim", "swimming", "pool", "water sports"
- `fitness`: "gym", "workout", "training", "bootcamp", "zumba", "dance"

### GET /api/events/sync

**Frontend calls this endpoint** — handles cache checking and calls both Meetup and Eventbrite in parallel.

**Parameters:**

- `lat` (number, required) - Latitude
- `lng` (number, required) - Longitude
- `radius` (number, optional, default 25) - Radius in kilometers
- `sport` (string, optional) - Filter by sport (e.g., "running")
- `limit` (number, optional, default 50, max 100) - Max events to return

**Cache Logic:**

- Checks if cache is fresh (events cached within last 6 hours for this location)
- If fresh, returns cached events immediately
- If stale, calls Meetup and Eventbrite APIs in parallel
- Deduplicates by `(source, external_id)`
- Sorts by `start_time`

**Response:**

```json
{
  "success": true,
  "events": [...],
  "source": "cache" | "live",
  "cacheAge": "fresh" | "refreshed",
  "count": 42
}
```

## DAL Functions

### fetchNearbyExternalEvents(supabase, lat, lng, radiusKm?, sport?, limit?)

Query nearby external events within a radius using Haversine distance calculation.

```ts
const result = await fetchNearbyExternalEvents(supabase, 40.7128, -74.006, 25, 'running', 50);

if (result.success) {
  console.log('Found events:', result.data);
} else {
  console.error('Error:', result.error);
}
```

**Returns:** `DalResult<ExternalEvent[]>`

### upsertExternalEvents(supabase, events[])

Bulk upsert events into the database. Uses conflict on `(source, external_id)`.

```ts
const result = await upsertExternalEvents(supabase, [
  {
    source: 'meetup',
    external_id: '123',
    title: 'Run',
    // ... other fields
  },
]);
```

**Returns:** `DalResult<ExternalEvent[]>`

### cleanExpiredEvents(supabase)

Delete all events past their `expires_at` timestamp. Call this periodically (e.g., daily cron).

```ts
const result = await cleanExpiredEvents(supabase);
if (result.success) {
  console.log(`Deleted ${result.data} expired events`);
}
```

**Returns:** `DalResult<number>` (count of deleted events)

### isCacheFresh(supabase, lat, lng, radiusKm?)

Check if cache is fresh for a location (non-expired events cached within last 6 hours).

```ts
const result = await isCacheFresh(supabase, 40.7128, -74.006, 25);

if (result.success && result.data) {
  console.log('Cache is fresh, use it');
} else {
  console.log('Cache is stale, refresh from APIs');
}
```

**Returns:** `DalResult<boolean>`

## Components

### ExternalEventCard

Displays a single external event with:

- Event image or sport icon placeholder
- Source badge (Meetup, Eventbrite, Strava) with brand color
- Sport tag with emoji
- Date, time, location
- Participant count (if available)
- Organizer name (if available)
- Two buttons: "View Event" (external link) and "Create Tribe Session" (navigates to `/create` pre-filled)

**Props:**

```ts
interface ExternalEventCardProps {
  event: ExternalEvent;
  language: string; // 'en' or 'es'
}
```

**Styling:**

- Dark theme: `bg-[#3D4349]`, `border-[#52575D]`
- Tribe green accent: `#22C55E`
- Hover effects and transitions

### NearbyEvents

Full section component for home page with:

- Title: "🎯 Happening Near You"
- Sport filter pills (All Sports, Running, Cycling, etc.)
- Horizontal scrollable event cards
- Automatic geolocation detection
- Loading skeleton state
- Empty state with helpful message
- Bilingual support (English/Spanish)

**Props:**

```ts
interface NearbyEventsProps {
  language: string; // 'en' or 'es'
}
```

**How it works:**

1. Component mounts and requests user geolocation
2. Calls `/api/events/sync` with user location
3. Displays events with selected sport filter
4. Handles loading, error, and empty states
5. Sport pills filter events client-side (re-fetch on selection change)

## Caching Strategy

- **Cache TTL:** 7 days (events expire after this)
- **Cache freshness check:** 6 hours (re-fetch from APIs if older)
- **Deduplication:** By `(source, external_id)`
- **Cleanup:** Call `cleanExpiredEvents()` daily via cron job

## Adding to Frontend

### In Home Page

```tsx
'use client';

import NearbyEvents from '@/components/NearbyEvents';
import { useSettings } from '@/app/settings/useSettings';

export default function HomePage() {
  const { language } = useSettings();

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Other sections */}
      <NearbyEvents language={language} />
      {/* More sections */}
    </main>
  );
}
```

### Styling with Tailwind

All components use Tailwind CSS with dark theme colors:

- Background: `bg-[#3D4349]`
- Border: `border-[#52575D]`
- Accent: `bg-[#22C55E]` (Tribe green)
- Text: `text-white`, `text-gray-400`

## Testing

### Manual Testing

1. Get API keys from Meetup and Eventbrite
2. Add to `.env.local`
3. Navigate to home page
4. Allow geolocation
5. Should see external events loading

### Without API Keys

1. Don't set `MEETUP_API_KEY` or `EVENTBRITE_API_KEY`
2. The system falls back to cached events only
3. Useful for testing UI before obtaining keys

### Database Testing

```sql
-- Check event count
SELECT COUNT(*) FROM external_events;

-- Check events by source
SELECT source, COUNT(*) FROM external_events GROUP BY source;

-- Check expired events
SELECT COUNT(*) FROM external_events WHERE expires_at < NOW();

-- Clean up expired
DELETE FROM external_events WHERE expires_at < NOW();
```

## Troubleshooting

### Events not showing up

1. **Check geolocation:** Browser must allow location access
2. **Check cache:** Query database directly
3. **Check API keys:** Verify `MEETUP_API_KEY` and `EVENTBRITE_API_KEY` are set
4. **Check logs:** Look for errors in `logError()` output

### API rate limits

- **Meetup:** Generous for authenticated requests
- **Eventbrite:** 5,000 requests/day for standard apps
- Solution: Implement per-user caching or request batching

### Distance calculations incorrect

- Uses Haversine formula on JavaScript side (6371 km Earth radius)
- Verify lat/lng coordinates are correct
- Consider using PostGIS extension in Supabase for native geo queries

## Future Enhancements

1. **Strava integration** — Add Strava API support (already in schema)
2. **User preferences** — Save favorite sports/locations
3. **Notifications** — Alert when events match user preferences
4. **Map view** — Show events on interactive map
5. **Event filtering** — By date range, skill level, group size
6. **Refresh button** — Manual refresh of cache
7. **Analytics** — Track which external events users interact with
8. **Feedback loop** — Help improve sport detection with user corrections

## Files Created

- `/lib/dal/externalEvents.ts` - DAL functions
- `/app/api/events/meetup/route.ts` - Meetup API route
- `/app/api/events/eventbrite/route.ts` - Eventbrite API route
- `/app/api/events/sync/route.ts` - Combined sync endpoint
- `/components/ExternalEventCard.tsx` - Event card component
- `/components/NearbyEvents.tsx` - Events section component

## Related Files

- Database migration: `supabase/migrations/012_external_events.sql`
- DAL exports: `lib/dal/index.ts`
