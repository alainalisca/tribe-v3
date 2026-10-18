import { cache } from 'react';
import { loadSessionForCard, type LoadedSession } from '@/lib/og/sessionCard';
import { publicSessionPlace } from '@/lib/share/sessionPublic';
import { sessionEndsAtBogota } from '@/lib/gymTimetable';
import type { PublicSession } from '@/app/session/[id]/SignedOutSession';

/**
 * T-SSR1: the public session as one request reads it. The page's metadata,
 * its JSON-LD and the signed-out page rendered on the server share this one
 * read (React cache: once per request).
 */
export const loadPublicSession = cache(loadSessionForCard);

/**
 * The signed-out page's props from the public row, worked out on the server.
 * `location` is never passed on: a client component's props are written
 * into the HTML, and the street address must not be. The place (partner gym
 * or barrio) is computed here from it instead.
 */
export function signedOutProps(loaded: LoadedSession, now: Date = new Date()) {
  const { row, partnerName } = loaded;
  const session: PublicSession = {
    id: row.id,
    title: row.title,
    sport: row.sport,
    date: row.date,
    start_time: row.start_time,
    duration: row.duration ?? null,
    description: row.description ?? null,
    photos: row.photos,
    max_participants: row.max_participants ?? 0,
    current_participants: row.current_participants ?? 0,
    status: row.status,
    is_paid: row.is_paid ?? null,
    price_cents: row.price_cents ?? null,
    currency: row.currency ?? null,
    creator_id: row.creator_id ?? null,
    location: null,
    location_lat: row.location_lat,
    location_lng: row.location_lng,
    partner_status: row.partner_status,
  };
  const place = publicSessionPlace({
    partnerName,
    partnerApproved: row.partner_status === 'approved' && !!partnerName,
    lat: row.location_lat,
    lng: row.location_lng,
    location: row.location,
  });
  return {
    session,
    creator: row.creator_id
      ? { id: row.creator_id, name: row.creator_name ?? null, avatar_url: row.creator_avatar_url ?? null }
      : null,
    gymName: partnerName,
    place,
    isPast: sessionEndsAtBogota({ date: row.date, start_time: row.start_time, duration: row.duration }) < now,
    isFull: (row.current_participants ?? 0) >= (row.max_participants ?? 0) && (row.max_participants ?? 0) > 0,
  };
}
