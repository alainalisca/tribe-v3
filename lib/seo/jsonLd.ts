/**
 * Structured data (JSON-LD) for search engines (T-GROW5a). Pure builders plus a
 * serializer that is safe to drop inside a <script> tag.
 *
 * PUBLIC DATA ONLY. Every input comes from the anon-facing views the page
 * already renders: sessions_public for a session, partners_public for a
 * partner. Nothing here reads a column a signed-out stranger cannot see.
 *
 * NO geo ON A SESSION, deliberately. sessions_public rounds coordinates to 3
 * decimal places (~110 m) because a session's pin can be a person's home or a
 * park bench; publishing them again as structured data would hand that rounded
 * point to every crawler in a machine-readable form, for no ranking benefit
 * that the address text does not already give. A PARTNER's lat/lng is its
 * business address, published on purpose, so the partner object carries geo.
 *
 * A builder returns null rather than an invalid object: Google requires an
 * Event to have a name, a startDate and a location, and emitting one without
 * them earns a Search Console error instead of a rich result.
 */

/** Colombia has no daylight saving; -05:00 is exact all year. */
export const BOGOTA_OFFSET = '-05:00';

export interface SessionJsonLdInput {
  url: string;
  title: string | null;
  sport: string | null;
  description: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  price_cents: number | null;
  currency: string | null;
  status: string | null;
  creator_name: string | null;
  image: string | null;
}

export interface PartnerJsonLdInput {
  url: string;
  business_name: string | null;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
}

type JsonLd = Record<string, unknown>;

/** "2026-10-12" + "18:30:00" -> "2026-10-12T18:30:00-05:00", or null if either is malformed. */
export function bogotaDateTime(date: string | null, time: string | null): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const m = time ? /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(time) : null;
  if (!m) return null;
  return `${date}T${m[1]}:${m[2]}:${m[3] ?? '00'}${BOGOTA_OFFSET}`;
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function sessionEventJsonLd(s: SessionJsonLdInput): JsonLd | null {
  const name = present(s.title) ? s.title.trim() : present(s.sport) ? s.sport.trim() : null;
  const startDate = bogotaDateTime(s.date, s.start_time);
  if (!name || !startDate || !present(s.location)) return null;

  const free = !s.price_cents || s.price_cents <= 0;
  const endDate = bogotaDateTime(s.date, s.end_time);
  const out: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name,
    startDate,
    eventStatus: s.status === 'cancelled' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: s.location.trim(), address: s.location.trim() },
    isAccessibleForFree: free,
    url: s.url,
  };
  // An end before the start would be a session past midnight; omit rather than lie.
  if (endDate && endDate > startDate) out.endDate = endDate;
  if (present(s.description)) out.description = s.description.trim().slice(0, 500);
  if (present(s.image)) out.image = [s.image];
  if (present(s.creator_name)) out.organizer = { '@type': 'Person', name: s.creator_name.trim() };
  if (!free) {
    out.offers = {
      '@type': 'Offer',
      // price_cents is in minor units; COP prices are whole pesos.
      price: String(Math.round((s.price_cents as number) / 100)),
      priceCurrency: present(s.currency) ? s.currency.toUpperCase() : 'COP',
      availability: 'https://schema.org/InStock',
      url: s.url,
    };
  }
  return out;
}

export function partnerJsonLd(p: PartnerJsonLdInput): JsonLd | null {
  if (!present(p.business_name)) return null;
  const out: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: p.business_name.trim(),
    url: p.url,
  };
  if (present(p.address)) out.address = p.address.trim();
  if (typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    out.geo = { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng };
  }
  if (present(p.image)) out.image = p.image;
  if (present(p.description)) out.description = p.description.trim().slice(0, 500);
  return out;
}

/**
 * JSON for inside <script type="application/ld+json">. JSON.stringify alone is
 * NOT safe there: a session title containing "</script>" would close the tag and
 * whatever follows would run as HTML. Escaping <, > and & as <-style
 * sequences keeps the JSON identical to a parser and inert to the HTML one.
 * U+2028/2029 are escaped because older JS engines treat them as line breaks.
 */
export function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === 'string' ? v : null;
}

function num(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * A sessions_public row (as /s/[id] fetches it) to the builder's input. Reads
 * each field by type rather than casting the row, so a renamed column becomes a
 * missing field and a null result, not a wrong value.
 */
export function sessionJsonLdInputFromRow(row: Record<string, unknown>, url: string): SessionJsonLdInput {
  const photos = row.photos;
  const firstPhoto = Array.isArray(photos) && typeof photos[0] === 'string' ? photos[0] : null;
  return {
    url,
    title: str(row, 'title'),
    sport: str(row, 'sport'),
    description: str(row, 'description'),
    date: str(row, 'date'),
    start_time: str(row, 'start_time'),
    end_time: str(row, 'end_time'),
    location: str(row, 'location'),
    price_cents: num(row, 'price_cents'),
    currency: str(row, 'currency'),
    status: str(row, 'status'),
    creator_name: str(row, 'creator_name'),
    image: firstPhoto,
  };
}
