// Helpers for safely rendering a session's location string in the UI.
//
// Some legacy / pre-launch sessions saved their `location` field as raw
// GPS like "6.220661, -75.573718" (because the create form passed the
// geocoded coords through verbatim when reverse-geocoding failed). Showing
// that to a user is a trust killer — they can't tell what the place is.
// This module normalises every location render through one chokepoint so
// the home feed, session detail page, and any future surfaces all behave
// the same way.

import { ACTIVE_CITY, detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';

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

/** Case- and accent-insensitive key for comparing address segments. */
function segmentKey(segment: string): string {
  return segment
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Administrative segments to drop from a short address: the active city, its
 * country, and its department.
 *
 * The department is not on CityConfig, so it is listed here rather than
 * invented as a config field for one string. Revisit when Tribe launches in a
 * second city and this needs to travel with the config.
 */
const ADMIN_SEGMENTS = new Set([
  segmentKey(ACTIVE_CITY.name),
  segmentKey(ACTIVE_CITY.country),
  segmentKey('Antioquia'),
]);

/**
 * Collapse repeated comma-separated segments in an address, keeping the first
 * occurrence and the original order.
 *
 * Google returns Medellín addresses that name the barrio and city twice
 * ("Cl. 20 #43g - 155, El Poblado, Medellín, El Poblado, Medellín, Antioquia,
 * Colombia"). 45 of 311 live sessions carry a string like that. Nothing in the
 * app concatenates them, so this is a display-side repair.
 */
export function dedupeLocationSegments(location: string | null | undefined): string {
  const raw = (location ?? '').trim();
  if (!raw) return '';

  const seen = new Set<string>();
  const kept: string[] = [];
  for (const segment of raw.split(',')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const key = segmentKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(trimmed);
  }
  return kept.join(', ');
}

export interface SessionLocationParts {
  /** The gym or studio hosting this session, when one has approved it. */
  venue: string | null;
  /** The short address, with any repetition of the venue name removed. */
  address: string;
}

/**
 * The same short location, split so a caller can weight the two halves
 * differently. The card renders the venue bold and the address plain.
 *
 * `venueName` is de-duplicated against the leading segment rather than matched
 * whole: live sessions store "CrossFit BullBox Ciudad del Rio, Cra 43G #25a-50,
 * ...", where the branch ("Ciudad del Rio") is real information sitting inside
 * the same segment as the gym name. Stripping the segment entirely would throw
 * the branch away, so only the matching prefix is removed and the remainder
 * survives as part of the address.
 */
export function formatSessionLocationShortParts(
  location: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  language: 'en' | 'es' = 'en',
  venueName?: string | null
): SessionLocationParts {
  const venue = (venueName ?? '').trim() || null;
  const address = shortAddress(location, lat, lng, language, venue);
  return { venue, address };
}

/**
 * A short, card-sized version of a session's location.
 *
 * Returns the street (or venue) plus the neighborhood when we can recognise
 * one, and drops the city, department and country that every Medellín address
 * repeats. "Cl. 20 #43g - 155, El Poblado, Medellín, El Poblado, Medellín,
 * Antioquia, Colombia" becomes "Cl. 20 #43g - 155, El Poblado".
 *
 * With `venueName`, the venue is prepended and de-duplicated against the
 * leading segment: "CrossFit BullBox · Ciudad del Río, Cra 43G #25a-50".
 *
 * The detail page keeps the full string; it only needs dedupeLocationSegments.
 */
export function formatSessionLocationShort(
  location: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  language: 'en' | 'es' = 'en',
  venueName?: string | null
): string {
  const { venue, address } = formatSessionLocationShortParts(location, lat, lng, language, venueName);
  if (!venue) return address;
  return address ? `${venue} · ${address}` : venue;
}

/** Strip a leading occurrence of the venue name from an address segment. */
function stripVenuePrefix(segment: string, venue: string): string {
  if (segmentKey(segment) === segmentKey(venue)) return '';
  if (segment.toLowerCase().startsWith(venue.toLowerCase())) {
    return segment
      .slice(venue.length)
      .replace(/^[\s,·\-–—]+/, '')
      .trim();
  }
  return segment;
}

function shortAddress(
  location: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  language: 'en' | 'es',
  venue: string | null
): string {
  const hood =
    typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? detectNeighborhood(lat, lng) || getNearestNeighborhood(lat, lng)
      : null;
  const notSpecified = language === 'es' ? 'Ubicación no especificada' : 'Location not specified';

  const trimmed = (location ?? '').trim();
  if (!trimmed || isRawCoordsString(trimmed)) {
    if (hood?.name) return hood.name;
    return venue ? '' : notSpecified;
  }

  const segments = dedupeLocationSegments(trimmed)
    .split(', ')
    .filter((segment) => segment && !ADMIN_SEGMENTS.has(segmentKey(segment)));

  if (segments.length === 0) {
    return venue ? '' : (hood?.name ?? notSpecified);
  }

  const known = new Set(ACTIVE_CITY.neighborhoods.map((n) => segmentKey(n.name)));
  const head = venue ? stripVenuePrefix(segments[0], venue) : segments[0];
  const neighborhood = segments.slice(1).find((segment) => known.has(segmentKey(segment)));

  if (!head) return neighborhood ?? '';
  return neighborhood ? `${head}, ${neighborhood}` : head;
}

/**
 * The neighbourhood from a partner's street address, for a directory tile.
 *
 * Falls back neighbourhood -> city -> null, and NEVER returns a street. A tile
 * reading "Cra 43G #25a-50" looks like a bug; a tile with no location line
 * reads fine, and the full address is on the storefront, which is where
 * somebody goes for it (Al, 2026-09-11).
 */
export function neighborhoodFromAddress(address: string | null | undefined): string | null {
  const trimmed = (address ?? '').trim();
  if (!trimmed) return null;

  const segments = dedupeLocationSegments(trimmed)
    .split(', ')
    .map((s) => s.trim())
    .filter(Boolean);

  const known = new Map(ACTIVE_CITY.neighborhoods.map((n) => [segmentKey(n.name), n.name]));
  for (const segment of segments) {
    const match = known.get(segmentKey(segment));
    if (match) return match;
  }

  const city = segments.find((s) => segmentKey(s) === segmentKey(ACTIVE_CITY.name));
  return city ?? null;
}
