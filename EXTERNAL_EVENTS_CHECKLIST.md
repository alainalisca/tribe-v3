# External Events Integration Checklist

Use this checklist to verify the external event aggregation system is fully integrated and working.

## Pre-Integration (Before Starting)

- [ ] Review `EXTERNAL_EVENTS_QUICKSTART.md` (5 minutes)
- [ ] Review `EXTERNAL_EVENTS_SETUP.md` (15 minutes)
- [ ] Ensure database migration 012 has been applied
- [ ] Database `external_events` table exists and is empty/clean

## Step 1: Environment Variables (10 min)

### Meetup API Key

- [ ] Navigate to https://www.meetup.com/api/consulting/
- [ ] Sign in with Meetup account
- [ ] Create OAuth consumer
- [ ] Copy API key

### Eventbrite API Key

- [ ] Navigate to https://www.eventbrite.com/platform/api/
- [ ] Create new app
- [ ] Generate OAuth token
- [ ] Copy token

### Local Configuration

- [ ] Add to `.env.local`:
  ```
  MEETUP_API_KEY=your_meetup_api_key_here
  EVENTBRITE_API_KEY=your_eventbrite_api_key_here
  ```
- [ ] Verify `.env.local` is in `.gitignore`
- [ ] Restart Next.js dev server

## Step 2: Verify Files Exist (5 min)

- [ ] `/lib/dal/externalEvents.ts` exists
- [ ] `/app/api/events/meetup/route.ts` exists
- [ ] `/app/api/events/eventbrite/route.ts` exists
- [ ] `/app/api/events/sync/route.ts` exists
- [ ] `/components/ExternalEventCard.tsx` exists
- [ ] `/components/NearbyEvents.tsx` exists
- [ ] `/lib/dal/index.ts` exports `externalEvents`

## Step 3: Database Verification (5 min)

```bash
# Connect to database
psql $DATABASE_URL

# Run these checks
SELECT COUNT(*) FROM external_events;
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'external_events';
```

- [ ] Table exists
- [ ] Has correct columns (id, source, external_id, title, sport, location_lat, location_lng, etc.)
- [ ] Unique constraint on (source, external_id)
- [ ] Indexes exist on sport, cached_at, expires_at
- [ ] RLS policy: public read
- [ ] RLS policy: server-role write

## Step 4: Test API Endpoints Directly (10 min)

### Test Meetup Endpoint

```bash
curl "http://localhost:3000/api/events/meetup?lat=40.7128&lng=-74.0060&radius=25"
```

- [ ] Returns 200 OK
- [ ] Response has `success: true`
- [ ] Response has `events` array
- [ ] Events have correct fields (title, sport, location_lat, location_lng, start_time, etc.)
- [ ] Events have source: 'meetup'

### Test Eventbrite Endpoint

```bash
curl "http://localhost:3000/api/events/eventbrite?lat=40.7128&lng=-74.0060&radius=25"
```

- [ ] Returns 200 OK
- [ ] Response has `success: true`
- [ ] Response has `events` array
- [ ] Events have correct fields
- [ ] Events have source: 'eventbrite'

### Test Sync Endpoint

```bash
curl "http://localhost:3000/api/events/sync?lat=40.7128&lng=-74.0060&radius=25"
```

- [ ] Returns 200 OK
- [ ] Response has `success: true`
- [ ] Response has `events` array
- [ ] Response has `source` field (cache or live)
- [ ] Response has `cacheAge` field (fresh or refreshed)
- [ ] Response has `count` field

### Test Sync with Sport Filter

```bash
curl "http://localhost:3000/api/events/sync?lat=40.7128&lng=-74.0060&radius=25&sport=running"
```

- [ ] Returns events filtered to sport='running'
- [ ] All events have sport='running'

## Step 5: Verify Database is Populated (5 min)

After running API tests above:

```bash
SELECT COUNT(*) FROM external_events;
SELECT DISTINCT source FROM external_events;
SELECT DISTINCT sport FROM external_events LIMIT 10;
```

- [ ] Events are present in database
- [ ] Source includes 'meetup' and 'eventbrite'
- [ ] Sports are properly categorized (running, cycling, yoga, etc.)
- [ ] cached_at is recent
- [ ] expires_at is in the future

## Step 6: Add to Home Page (10 min)

### In Home Page Component

```tsx
import NearbyEvents from '@/components/NearbyEvents';

export default function HomePage({ language }: { language: string }) {
  return (
    <main>
      {/* Other sections */}
      <NearbyEvents language={language} />
      {/* Other sections */}
    </main>
  );
}
```

- [ ] Import statement added
- [ ] Component placed in correct location
- [ ] `language` prop passed correctly
- [ ] Component compiles without errors

## Step 7: Browser Testing (15 min)

### Navigate to Home Page

1. Open browser to home page
2. Check browser console for errors
3. Allow geolocation when prompted

- [ ] No errors in console
- [ ] Geolocation request appears
- [ ] "Happening Near You" section is visible
- [ ] Loading skeleton appears briefly

### Verify Events Load

- [ ] Events display in horizontal scroll
- [ ] Event cards show:
  - [ ] Event image or placeholder
  - [ ] Source badge (Meetup/Eventbrite)
  - [ ] Sport tag with emoji
  - [ ] Date and time
  - [ ] Location name
  - [ ] Participant count (if available)
  - [ ] Organizer name (if available)
  - [ ] "View Event" button
  - [ ] "Create Tribe Session" button

### Test Sport Filters

- [ ] Click "All Sports" pill
  - [ ] Shows all events
- [ ] Click "Running" pill
  - [ ] Shows only running events
  - [ ] Other sports filtered out
- [ ] Click another sport
  - [ ] Events update correctly
  - [ ] Loading state appears briefly

### Test Actions

- [ ] Click "View Event" button
  - [ ] Opens external event URL in new tab
  - [ ] URL is correct (Meetup or Eventbrite)
- [ ] Click "Create Tribe Session" button
  - [ ] Navigates to `/create` page
  - [ ] URL contains query params:
    - [ ] `externalEventId`
    - [ ] `title`
    - [ ] `sport`
    - [ ] `location`
    - [ ] `lat`
    - [ ] `lng`

### Test Responsive Design

- [ ] Desktop view looks good
- [ ] Tablet view looks good
- [ ] Mobile view:
  - [ ] Cards are scrollable horizontally
  - [ ] Pills are scrollable horizontally
  - [ ] Buttons are tappable
  - [ ] Text is readable

### Test Bilingual UI

- [ ] Change language setting to Spanish
- [ ] Verify "Sucediendo Cerca" displays
- [ ] Verify sport names are Spanish
- [ ] Verify button text is Spanish ("Crear Sesión Tribe", "Ver Evento")
- [ ] Change back to English
- [ ] Verify English text displays

## Step 8: Error Handling Testing (10 min)

### Test Without API Keys

1. Remove `MEETUP_API_KEY` from `.env.local`
2. Reload page

- [ ] Page still loads without errors
- [ ] Events display from cache only
- [ ] No API error messages shown

### Test with Invalid API Key

1. Set `MEETUP_API_KEY=invalid_key`
2. Force cache to be stale:
   - [ ] Delete or modify `cached_at` values in database
3. Reload page

- [ ] Page still loads without errors
- [ ] Falls back to cache gracefully
- [ ] No user-visible errors

### Test with Geolocation Disabled

1. Block geolocation in browser settings
2. Reload page

- [ ] Shows appropriate error message
- [ ] Doesn't crash
- [ ] Message matches language setting

### Test with No Nearby Events

1. Set lat/lng to remote location (e.g., Antarctica)
2. Force cache to be stale
3. Reload page

- [ ] Shows "No nearby events" message
- [ ] Suggests creating own session
- [ ] Message matches language setting

## Step 9: Cache Testing (20 min)

### Test Cache Freshness (6-hour TTL)

1. Load home page, note events displayed
2. Check `cached_at` in database:
   ```sql
   SELECT external_id, cached_at FROM external_events LIMIT 5;
   ```

- [ ] `cached_at` is recent (within last minute)

3. Reload home page immediately
   - [ ] Same events display (cache hit)
   - [ ] Response should indicate `source: 'cache'` or `cacheAge: 'fresh'`

4. Modify `cached_at` to 7 hours ago:

   ```sql
   UPDATE external_events SET cached_at = NOW() - INTERVAL '7 hours' LIMIT 1;
   ```

5. Reload home page
   - [ ] New events appear (cache refresh triggered)
   - [ ] Response indicates `source: 'live'` or `cacheAge: 'refreshed'`

### Test Event Expiration (7-day TTL)

1. Manually set `expires_at` to past for one event:

   ```sql
   UPDATE external_events SET expires_at = NOW() - INTERVAL '1 day' WHERE id = 'some-id';
   ```

2. Call cleanup function (or wait for cron job):
   - [ ] Expired event is deleted
   - [ ] Event no longer visible in API responses

## Step 10: Production Readiness (5 min)

- [ ] All environment variables set in production
- [ ] Database migration 012 applied in production
- [ ] No sensitive data in logs
- [ ] Error handling works correctly
- [ ] Performance is acceptable (events load within 3 seconds)
- [ ] Dark theme matches app design
- [ ] Bilingual UI works in both languages
- [ ] Mobile responsive on all devices
- [ ] No console errors
- [ ] No TypeScript errors

## Post-Integration (Optional Enhancements)

- [ ] Set up daily cron job to call `cleanExpiredEvents()`
- [ ] Monitor API rate limits (Meetup, Eventbrite)
- [ ] Add analytics tracking for event interactions
- [ ] Test with Strava API (schema already supports it)
- [ ] Implement user preference saving (favorite sports)
- [ ] Add event notifications

## Troubleshooting

If any checks fail, refer to:

1. **Setup issues:** `EXTERNAL_EVENTS_SETUP.md` → Troubleshooting section
2. **API issues:** Check server logs and API response bodies
3. **Component issues:** Check browser console and React DevTools
4. **Database issues:** Verify table schema and RLS policies

## Sign-Off

- [ ] All steps completed successfully
- [ ] No errors or warnings in console
- [ ] Events display correctly on home page
- [ ] All buttons work as expected
- [ ] Bilingual UI works
- [ ] Cache works correctly
- [ ] Error handling works
- [ ] System is ready for production

Date Completed: ****\_\_\_****
Tested By: ****\_\_\_****
Notes: ****\_\_\_****
