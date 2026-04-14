# Training Partner / Connections Feature Integration Guide

This guide explains how to integrate the new connections/training partners feature into existing pages.

## Feature Overview

The connections feature implements "session-gated connections" — users can only connect with people they've actually trained with in the same session. This prevents the app from becoming a social media/chat app by enforcing that:

1. Connection requests require a shared session
2. DMs are unlocked only after connection is accepted
3. Training partners are discovered based on shared sports and location

## Files Created

### Data Access Layer (DAL)

- **`lib/dal/connections.ts`** — Core functions for connections management
  - `sendConnectionRequest(supabase, requesterId, recipientId)`
  - `acceptConnection(supabase, connectionId)`
  - `declineConnection(supabase, connectionId)`
  - `removeConnection(supabase, connectionId)`
  - `getConnectionStatus(supabase, userId1, userId2)`
  - `fetchConnections(supabase, userId)`
  - `fetchPendingRequests(supabase, userId)`
  - `fetchTrainingPartners(supabase, userId, lat, lng, sport?)`
  - `hasSharedSession(supabase, userId1, userId2)`
  - `getSharedSessionCount(supabase, userId1, userId2)`

### Components

- **`components/TrainingPartnerCard.tsx`** — Individual partner card for horizontal scroll
- **`components/FindTrainingPartners.tsx`** — Full section with filtering (for home page)
- **`components/PostSessionConnect.tsx`** — Post-session prompt to connect with participants
- **`components/ConnectionButton.tsx`** — Smart button for profile pages (5 states)

### Pages

- **`app/connections/page.tsx`** — Connections management page (/connections)

## Integration Steps

### 1. Add to Home Page (`app/page.tsx`)

Import the component:

```tsx
import { FindTrainingPartners } from '@/components/FindTrainingPartners';
```

Add in your JSX (inside the main feed section):

```tsx
<FindTrainingPartners language={language} />
```

The component will:

- Get user's geolocation
- Fetch nearby training partners
- Filter by sport
- Show partners sorted by distance

### 2. Add to Profile Page (`app/profile/[userId]/page.tsx`)

Import the component:

```tsx
import ConnectionButton from '@/components/ConnectionButton';
```

Add in your JSX (in the profile actions section):

```tsx
<ConnectionButton
  currentUserId={currentUserId}
  profileUserId={userId}
  language={language}
  onConnect={() => {
    // Optionally refresh profile data
  }}
/>
```

The button will show different states based on connection status:

- Gray lock: "Train together first" (no shared session)
- Green: "Connect" (shared session, not connected)
- Amber: "Request Sent" (pending sent by current user)
- Green + Gray: "Accept" / "Decline" (pending received)
- Green outline: "Connected ✓" + "Message" button (accepted)

### 3. Add to Session End Modal (`app/session/[id]/SessionEndModal.tsx` or similar)

Import the component:

```tsx
import PostSessionConnect from '@/components/PostSessionConnect';
```

Add after session ends (in a modal or dedicated section):

```tsx
<PostSessionConnect
  sessionId={sessionId}
  currentUserId={currentUserId}
  participants={sessionParticipants}
  language={language}
  onConnectionSent={(participantId) => {
    // Optional: show toast notification
  }}
/>
```

The component will:

- Show all session participants
- Allow user to send connection requests
- Display "Request Sent" state after sending
- Filter out the current user

### 4. Add Navigation Link

Add to profile settings or navigation menu:

```tsx
<Link href="/connections">🤝 {language === 'es' ? 'Conexiones' : 'Connections'}</Link>
```

Or in your bottom nav / profile menu:

```tsx
<NavItem href="/connections" label="Connections" icon={Users} />
```

## Component Props

### FindTrainingPartners

```tsx
interface Props {
  language: string; // 'en' or 'es'
}
```

### TrainingPartnerCard

```tsx
interface Props {
  partner: TrainingPartner;
  language: string;
}
```

### PostSessionConnect

```tsx
interface Props {
  sessionId: string;
  currentUserId: string;
  participants: Participant[];
  language: string;
  onConnectionSent?: (participantId: string) => void;
}

interface Participant {
  id: string;
  name: string;
  avatar_url: string | null;
  sports: string[];
}
```

### ConnectionButton

```tsx
interface Props {
  currentUserId: string;
  profileUserId: string;
  language: string;
  onConnect?: () => void;
}
```

## Database Prerequisites

The feature requires migration 012 which includes:

**connections table:**

- id, requester_id, recipient_id, status, shared_session_id, created_at, accepted_at
- Status: 'pending' | 'accepted' | 'declined'

**RPC Functions:**

- `have_shared_session(user_a, user_b)` → boolean
- `first_shared_session(user_a, user_b)` → uuid
- `shared_session_count(user_a, user_b)` → integer

Run migration 012 if not already applied:

```bash
supabase db push
```

## Database Policies (RLS)

The connections table has RLS policies that enforce:

- Users can only view their own connections
- Users can only create requests after sharing a session (checked via RPC)
- Recipients can accept/decline
- Either party can delete connections

These are automatically enforced by Supabase.

## Translations

All UI strings are bilingual (English/Spanish). Add these to `lib/translations.ts` if needed:

```ts
export const translations = {
  en: {
    findTrainingPartners: 'Find Training Partners',
    seeAll: 'See All',
    noPartnersFound: 'No training partners found nearby',
    createSession: 'Create a session to attract them!',
    connect: 'Connect',
    requestSent: 'Request Sent',
    accept: 'Accept',
    decline: 'Decline',
    connected: 'Connected',
    message: 'Message',
    // ... more strings
  },
  es: {
    // Spanish translations
  },
};
```

## Styling & Dark Mode

All components follow the design system:

- **Dark backgrounds:** bg-[#272D34], bg-[#3D4349], bg-[#52575D]
- **Accent color:** tribe-green #A3E635
- **Text:** stone-900 (light) / white (dark)
- **Borders:** stone-300 / [#52575D]

Tailwind dark mode is applied automatically via `dark:` prefixes.

## Error Handling

All DAL functions return `DalResult<T>`:

```ts
interface DalResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

Example usage:

```ts
const result = await sendConnectionRequest(supabase, userId1, userId2);
if (result.success) {
  // Handle success
} else {
  console.error(result.error);
  // Show error to user
}
```

## Location & Distance

FindTrainingPartners uses:

- `navigator.geolocation` to get user's current location
- Fallback to NYC (40.7128, -74.006) if permission denied
- Haversine formula to calculate great-circle distance
- Displays distance in km with 1 decimal place

## Performance Considerations

1. **Distance Calculation:** Only calculated for filtered partners (not all users)
2. **RPC Checks:** `have_shared_session()` is cached by Postgres
3. **Indexing:** Connections table has indexes on requester_id, recipient_id, status
4. **Pagination:** Implement pagination for large results in future

## Testing

### Manual Testing Checklist

- [ ] User A and B create same session, confirm connection request works
- [ ] Connection request button shows "Request Sent" state
- [ ] User B receives request in /connections?tab=requests
- [ ] User B can Accept/Decline request
- [ ] Accepted connections appear in /connections?tab=connections
- [ ] "Message" button appears after connection accepted
- [ ] Remove connection deletes from both users
- [ ] Can't connect if no shared session (lock button appears)
- [ ] TrainingPartnerCard shows correct distance
- [ ] Sport filter pills work correctly
- [ ] Spanish translations display correctly
- [ ] Dark mode styling looks good
- [ ] Mobile responsive on small screens

### API Testing

```ts
// Test sendConnectionRequest
const result = await sendConnectionRequest(supabase, 'user-1-id', 'user-2-id');
console.log(result); // { success: true, data: 'connection-id' }

// Test fetchTrainingPartners
const partners = await fetchTrainingPartners(
  supabase,
  'user-id',
  40.7128, // lat
  -74.006, // lng
  'Running' // optional sport filter
);
console.log(partners); // { success: true, data: [...] }
```

## Common Issues

### Issue: "You must train together first"

**Solution:** Make sure both users have confirmed attendance in the same session.

### Issue: Connection request fails silently

**Solution:** Check browser console for error. Verify RLS policies are enabled on connections table.

### Issue: TrainingPartners list is empty

**Solution:**

1. Verify geolocation permission is granted
2. Check if user has any shared sessions
3. Verify other users have location_lat/location_lng set
4. Check if sports arrays match

### Issue: DMs still locked after connection

**Solution:** The conversation page should check `getOrCreateDirectConversation()` returns success. Implement gate in `/messages` route.

## Future Enhancements

1. **Pagination:** Infinite scroll for training partners list
2. **Sorting:** By distance, shared sports count, mutual friends
3. **Blocking:** Add ability to block users
4. **Connection Expiry:** Auto-expire old inactive connections (e.g., 1 year)
5. **Social Proof:** "You trained with X people in common"
6. **Notifications:** Notify user when connection request received
7. **Analytics:** Track connection conversion rate

## Questions?

Refer to the DAL functions in `lib/dal/connections.ts` for full implementation details.
