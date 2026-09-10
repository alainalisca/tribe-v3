'use client';

/**
 * The card's address line: venue, street, neighborhood, distance (T-GYM1).
 *
 * Extracted from SessionCard.tsx to keep it under the 300-line limit once the
 * venue name joined the line.
 *
 * The venue is bold and leads, because "CrossFit BullBox" is the thing an
 * athlete arriving from BullBox's Instagram is scanning for; the street is what
 * they need only once they have decided to go. It is already de-duplicated
 * against the street segment upstream by formatSessionLocationShortParts, so
 * this component never prints the gym twice.
 */

import { MapPin } from 'lucide-react';

interface SessionCardLocationProps {
  /** Approved gym or studio, bolded ahead of the address. Null for most sessions. */
  venueName: string | null;
  address: string;
  /** Appended when the address does not already name the neighborhood. */
  neighborhood: string | null;
  distance?: string;
}

export default function SessionCardLocation({ venueName, address, neighborhood, distance }: SessionCardLocationProps) {
  return (
    <div className="flex items-center text-sm text-theme-secondary">
      <MapPin className="w-3.5 h-3.5 mr-1.5 text-tribe-green flex-shrink-0" />
      {venueName && (
        <span className="font-bold text-theme-primary flex-shrink-0 mr-1">
          {venueName}
          {address ? ' ·' : ''}
        </span>
      )}
      <span className="truncate">{address}</span>
      {neighborhood && (
        <span className="ml-1.5 text-xs text-theme-tertiary font-medium flex-shrink-0">· {neighborhood}</span>
      )}
      {distance && <span className="ml-1.5 text-xs text-tribe-green font-medium flex-shrink-0">· {distance}</span>}
    </div>
  );
}
