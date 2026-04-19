# External Events - Quick Start

## 1. Get API Keys

### Meetup

1. Go to https://www.meetup.com/api/consulting/
2. Sign in → Create OAuth consumer
3. Copy API key → Add to `.env.local`

### Eventbrite

1. Go to https://www.eventbrite.com/platform/api/
2. Create app → Generate OAuth token
3. Copy token → Add to `.env.local`

## 2. Set Environment Variables

```bash
# .env.local
MEETUP_API_KEY=your_meetup_key_here
EVENTBRITE_API_KEY=your_eventbrite_key_here
```

## 3. Verify Database

```bash
# Check table exists
psql $DATABASE_URL -c "SELECT COUNT(*) FROM external_events;"
```

## 4. Add to Home Page

```tsx
// app/home/page.tsx
import NearbyEvents from '@/components/NearbyEvents';

export default function HomePage({ language }) {
  return (
    <div>
      {/* Other sections */}
      <NearbyEvents language={language} />
    </div>
  );
}
```

## 5. Test

1. Navigate to home page
2. Click "Allow" on geolocation prompt
3. Should see events loading in "Happening Near You" section
4. Click sport pills to filter
5. Click "View Event" to go to external site
6. Click "Create Tribe Session" to pre-fill create form

## API Endpoints

### Test Endpoints Directly

```bash
# Meetup only
curl "http://localhost:3000/api/events/meetup?lat=40.7128&lng=-74.0060&radius=25"

# Eventbrite only
curl "http://localhost:3000/api/events/eventbrite?lat=40.7128&lng=-74.0060&radius=25"

# Combined (smart cache + both APIs)
curl "http://localhost:3000/api/events/sync?lat=40.7128&lng=-74.0060&radius=25"

# With sport filter
curl "http://localhost:3000/api/events/sync?lat=40.7128&lng=-74.0060&sport=running"
```

## Supported Sports

- `running` - Running/jogging
- `cycling` - Biking
- `hiking` - Trail/hiking
- `yoga` - Yoga/pilates
- `crossfit` - CrossFit
- `soccer` - Soccer/football
- `swimming` - Swimming/water sports
- `fitness` - General fitness/gym

## Cache Behavior

- **Freshness check:** 6 hours per location
- **Event expiration:** 7 days
- **API calls:** Only if cache is stale
- **Fallback:** Cache is used if APIs fail

## Troubleshooting

### Events not showing

1. Check geolocation is enabled
2. Check API keys in `.env.local`
3. Refresh page and try again

### Wrong sport detected

- Meetup uses category IDs (accurate)
- Eventbrite uses keyword matching in title/description

### Getting same events repeatedly

- This is normal (cache deduplication)
- Different sources might have same event

## Files

| File                                 | Purpose                         |
| ------------------------------------ | ------------------------------- |
| `lib/dal/externalEvents.ts`          | Database queries                |
| `app/api/events/meetup/route.ts`     | Meetup API integration          |
| `app/api/events/eventbrite/route.ts` | Eventbrite API integration      |
| `app/api/events/sync/route.ts`       | Smart cache + combined endpoint |
| `components/ExternalEventCard.tsx`   | Single event card               |
| `components/NearbyEvents.tsx`        | Events section for home page    |

## See Also

- `EXTERNAL_EVENTS_SETUP.md` — Full setup guide
- `EXTERNAL_EVENTS_IMPLEMENTATION.md` — Implementation details

## Support

Check the setup guide for detailed troubleshooting and advanced configuration.
