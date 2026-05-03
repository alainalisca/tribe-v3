// Helpers for safely rendering a session's location string in the UI.
//
// Some legacy / pre-launch sessions saved their `location` field as raw
// GPS like "6.220661, -75.573718" (because the create form passed the
// geocoded coords through verbatim when reverse-geocoding failed). Showing
// that to a user is a trust killer — they can't tell what the place is.
// This module normalises every location render through one chokepoint so
// the home feed, session detail page, and any future surfaces all behave
// the same way.

import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';

/** Matches "6.220661, -75.573718" and similar raw lat/lng strings. */
const RAW_COORDS_RE = /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/;

export function isRawCoordsString(value: string | null | undefined): boolean {
  if (!value) return false;
  return RAW_COORDS_RE.test(value.trim());
}

/**
 * Render a session's location for display. Never returns raw lat/lng.
 *
 * Priority:
 *   1. The free-text `location` if it's a normal place name.
 *   2. The detected (or nearest) neighborhood name if lat/lng are present.
 *   3. A localized "Location not specified" fallback.
 */
export function formatSessionLocation(
  location: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  language: 'en' | 'es' = 'en'
): string {
  const trimmed = (location ?? '').trim();
  if (trimmed && !isRawCoordsString(trimmed)) {
    return trimmed;
  }

  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    const hood = detectNeighborhood(lat, lng) || getNearestNeighborhood(lat, lng);
    if (hood) return hood.name;
  }

  return language === 'es' ? 'Ubicación no especificada' : 'Location not specified';
}
