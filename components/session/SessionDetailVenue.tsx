'use client';

/**
 * Gym identity on the session detail page (T-GYM2, DoD 9).
 *
 * The gym was visible on the card and vanished when an athlete tapped through
 * -- the one place they go for detail. Same rules as the card, deliberately:
 * the venue leads the location line in bold, and the host area carries one
 * collapsed mark via presenterGymMark, so the two surfaces cannot drift.
 *
 * Lives apart from SessionDetails.tsx, which is at 289 lines.
 */
import { MapPin } from 'lucide-react';
import { PresenterGymTag, PendingVenueTag, GymHostRow } from '@/components/partner/SessionGymBits';
import { presenterGymMark, type SessionGymIdentity } from '@/lib/sessionGym';
import { formatSessionLocation, formatSessionLocationShortParts } from '@/lib/sessionLocation';

interface VenueLineProps {
  /** Undefined until resolved, or absent on an unlinked session. */
  gym?: SessionGymIdentity;
  location: string | null | undefined;
  lat: number | null;
  lng: number | null;
  language: 'en' | 'es';
}

/**
 * The location row: venue name bold, then the address.
 *
 * Owns the unlinked case too, so SessionDetails carries one element instead of
 * a branch -- which is also what keeps that file under the 300-line limit.
 */
export function SessionDetailVenueLine({ gym, location, lat, lng, language }: VenueLineProps) {
  const { venue, address } = formatSessionLocationShortParts(
    location,
    lat,
    lng,
    language,
    gym?.venue?.business_name ?? null
  );

  // No approved gym: the plain address, exactly as before.
  if (!venue) {
    return (
      <div className="flex items-start text-muted-foreground">
        <MapPin className="w-5 h-5 mr-3 mt-0.5 text-muted-foreground" />
        <span>{formatSessionLocation(location, lat, lng, language)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start text-muted-foreground">
      <MapPin className="w-5 h-5 mr-3 mt-0.5 text-muted-foreground" />
      <span className="min-w-0">
        {venue && <span className="font-bold text-theme-primary">{venue}</span>}
        {venue && address && ' · '}
        {address}
      </span>
    </div>
  );
}

/**
 * The gym beside the host. Nothing for an unaffiliated instructor, and nothing
 * to an athlete while a request is pending -- PendingVenueTag is the creator's
 * own view and the caller decides who sees it, exactly as the card does.
 */
export function SessionDetailGymHost({ gym, coachCount }: { gym: SessionGymIdentity; coachCount: number }) {
  if (gym.gymHosted && gym.venue) {
    return <GymHostRow gym={gym.venue} coachCount={coachCount} />;
  }
  if (gym.pending) return <PendingVenueTag gym={gym.pending} />;

  const mark = presenterGymMark(gym);
  if (!mark) return null;
  return <PresenterGymTag gym={mark.gym} asCoach={mark.asCoach} />;
}
