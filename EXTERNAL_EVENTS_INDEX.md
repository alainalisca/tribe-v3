# External Event Aggregation System - Complete Index

Welcome! This index guides you through the external event aggregation system for the Tribe fitness app.

## What is This?

A complete system that aggregates real fitness events from Meetup and Eventbrite, caches them in Supabase, and displays them in the Tribe app. Solves the cold-start problem by ensuring new users always see populated event feeds.

## Documentation

### START HERE (Pick One)

1. **In a hurry?** → Read [`EXTERNAL_EVENTS_QUICKSTART.md`](./EXTERNAL_EVENTS_QUICKSTART.md) (5 min)
   - Get API keys
   - Set environment variables
   - Add component to home page
   - Test locally

2. **Want full details?** → Read [`EXTERNAL_EVENTS_SETUP.md`](./EXTERNAL_EVENTS_SETUP.md) (15-20 min)
   - Architecture overview
   - Step-by-step setup
   - API endpoint documentation
   - Database schema
   - Testing guide
   - Troubleshooting

3. **Integrating it?** → Use [`EXTERNAL_EVENTS_CHECKLIST.md`](./EXTERNAL_EVENTS_CHECKLIST.md)
   - Step-by-step checklist
   - Verification at each stage
   - Testing procedures
   - Sign-off template

4. **Need technical details?** → Read [`EXTERNAL_EVENTS_IMPLEMENTATION.md`](./EXTERNAL_EVENTS_IMPLEMENTATION.md)
   - Implementation details
   - Feature summary
   - Code quality notes
   - Performance metrics
   - Future enhancements

## Code Files

### Data Access Layer

- **`lib/dal/externalEvents.ts`** — Database queries (Haversine distance, caching)

### API Routes

- **`app/api/events/meetup/route.ts`** — Meetup GraphQL integration
- **`app/api/events/eventbrite/route.ts`** — Eventbrite REST integration
- **`app/api/events/sync/route.ts`** — Smart sync endpoint (call this from frontend)

### UI Components

- **`components/ExternalEventCard.tsx`** — Single event card
- **`components/NearbyEvents.tsx`** — Full section for home page

## Quick Facts

- **Cache TTL:** 6 hours per location
- **Event Expiration:** 7 days
- **Sports Supported:** 8 (running, cycling, hiking, yoga, crossfit, soccer, swimming, fitness)
- **Languages:** English and Spanish
- **Database:** Supabase (migration 012)
- **API Sources:** Meetup (GraphQL), Eventbrite (REST)

## Integration Flow

```
User visits home page
  ↓
NearbyEvents component mounts
  ↓
Requests geolocation
  ↓
Calls /api/events/sync with lat/lng
  ↓
Endpoint checks cache freshness
  ↓
If fresh: returns cached events
If stale: calls Meetup + Eventbrite in parallel
  ↓
Events displayed in horizontal scroll
  ↓
User can filter by sport
  ↓
"View Event" → external link
"Create Tribe Session" → /create pre-filled
```

## Files Overview

| File                                 | Size   | Purpose               |
| ------------------------------------ | ------ | --------------------- |
| `lib/dal/externalEvents.ts`          | 5.9 KB | Database queries      |
| `app/api/events/meetup/route.ts`     | 7.5 KB | Meetup API            |
| `app/api/events/eventbrite/route.ts` | 7.5 KB | Eventbrite API        |
| `app/api/events/sync/route.ts`       | 4.3 KB | Smart sync            |
| `components/ExternalEventCard.tsx`   | 5.6 KB | Event card UI         |
| `components/NearbyEvents.tsx`        | 7.3 KB | Events section        |
| `EXTERNAL_EVENTS_SETUP.md`           | 12 KB  | Setup guide           |
| `EXTERNAL_EVENTS_IMPLEMENTATION.md`  | 9.5 KB | Technical details     |
| `EXTERNAL_EVENTS_QUICKSTART.md`      | 3.0 KB | Quick start           |
| `EXTERNAL_EVENTS_CHECKLIST.md`       | 5+ KB  | Integration checklist |

**Total: 67+ KB of code and documentation**

## Setup Checklist (5-Step Overview)

- [ ] Get API keys (Meetup + Eventbrite)
- [ ] Add to `.env.local`
- [ ] Verify database migration 012 applied
- [ ] Add `<NearbyEvents language={language} />` to home page
- [ ] Test: navigate to home page, allow geolocation, verify events display

## Key Features

- Smart cache with 6-hour freshness check
- Parallel API requests for performance
- Graceful fallback when API keys missing
- Haversine distance calculation for location filtering
- Automatic sport detection and categorization
- Bilingual UI (English/Spanish)
- Dark theme matching Tribe design
- Mobile responsive
- Full TypeScript type safety
- Comprehensive error handling

## API Endpoints

```bash
# Meetup events only
GET /api/events/meetup?lat=40.7128&lng=-74.0060&radius=25

# Eventbrite events only
GET /api/events/eventbrite?lat=40.7128&lng=-74.0060&radius=25

# Combined (smart cache + both APIs) - FRONTEND CALLS THIS
GET /api/events/sync?lat=40.7128&lng=-74.0060&radius=25&sport=running&limit=50
```

## Database Table

`external_events` table with columns:

- id, source, external_id, title, description, sport
- location_lat, location_lng, location_name
- event_url, image_url
- start_time, end_time, participant_count, organizer_name
- cached_at, expires_at

Unique constraint on `(source, external_id)`
RLS: public read, server-role write

## Environment Variables

```bash
MEETUP_API_KEY=your_key_here
EVENTBRITE_API_KEY=your_key_here
```

(Optional - system works without keys, uses cache only)

## Help & Support

1. **Quick question?** → [`EXTERNAL_EVENTS_QUICKSTART.md`](./EXTERNAL_EVENTS_QUICKSTART.md)
2. **Setup issue?** → [`EXTERNAL_EVENTS_SETUP.md`](./EXTERNAL_EVENTS_SETUP.md) Troubleshooting
3. **Integration?** → [`EXTERNAL_EVENTS_CHECKLIST.md`](./EXTERNAL_EVENTS_CHECKLIST.md)
4. **Technical details?** → [`EXTERNAL_EVENTS_IMPLEMENTATION.md`](./EXTERNAL_EVENTS_IMPLEMENTATION.md)

## Testing

```bash
# Test sync endpoint
curl "http://localhost:3000/api/events/sync?lat=40.7128&lng=-74.0060"

# Expected 200 OK with events array
# Response includes: success, events, source, cacheAge, count
```

## Next Steps

1. Read [`EXTERNAL_EVENTS_QUICKSTART.md`](./EXTERNAL_EVENTS_QUICKSTART.md) (5 min)
2. Get API keys from Meetup and Eventbrite (10 min)
3. Add to `.env.local` and restart dev server (5 min)
4. Add `<NearbyEvents />` to home page (5 min)
5. Test in browser (10 min)
6. Use [`EXTERNAL_EVENTS_CHECKLIST.md`](./EXTERNAL_EVENTS_CHECKLIST.md) for sign-off (10 min)

**Total time: ~45 minutes for full integration**

## Production Deployment

- Ensure all environment variables set in production
- Verify database migration 012 applied
- Test API endpoints before deploying
- Set up daily cleanup job (optional but recommended)
- Monitor API rate limits (Meetup: generous, Eventbrite: 5k/day)
- Track error logs for any issues

## System Highlights

✓ Complete implementation (5 code + 4 docs files)
✓ Production-ready code
✓ Full TypeScript type safety
✓ Comprehensive documentation
✓ Bilingual UI (EN/ES)
✓ Dark theme with Tribe branding
✓ Smart caching strategy
✓ Error handling included
✓ Mobile responsive
✓ No additional dependencies needed

## Success Criteria

System is working when you see:

1. "Happening Near You" section on home page
2. Event cards with Meetup/Eventbrite badges
3. Sport filter pills that work
4. Events load from both APIs
5. Cache refreshes every 6 hours
6. No console errors
7. Works on mobile

---

**Ready to get started?** → Read [`EXTERNAL_EVENTS_QUICKSTART.md`](./EXTERNAL_EVENTS_QUICKSTART.md)

**Questions?** → See [`EXTERNAL_EVENTS_SETUP.md`](./EXTERNAL_EVENTS_SETUP.md) Troubleshooting section

**Integrating?** → Use [`EXTERNAL_EVENTS_CHECKLIST.md`](./EXTERNAL_EVENTS_CHECKLIST.md)
