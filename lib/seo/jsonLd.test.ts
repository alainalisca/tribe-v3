import { describe, it, expect } from 'vitest';
import {
  bogotaDateTime,
  partnerJsonLd,
  serializeJsonLd,
  sessionEventJsonLd,
  sessionJsonLdInputFromRow,
  type PartnerJsonLdInput,
  type SessionJsonLdInput,
} from './jsonLd';

const SESSION: SessionJsonLdInput = {
  url: 'https://tribelatam.com/s/abc/',
  title: 'HYROX Simulación',
  sport: 'HYROX',
  description: 'Bloques de estaciones',
  date: '2026-10-12',
  start_time: '18:30:00',
  end_time: '19:30:00',
  location: 'CrossFit BullBox Ciudad del Río',
  price_cents: 2_500_000,
  currency: 'cop',
  status: 'active',
  creator_name: 'Leo',
  image: 'https://example.com/a.jpg',
};

const PARTNER: PartnerJsonLdInput = {
  url: 'https://tribelatam.com/g/bullbox/',
  business_name: 'CrossFit BullBox',
  description: 'Box en Ciudad del Río',
  address: 'Cra 48 #20-34, Medellín',
  lat: 6.2232,
  lng: -75.5761,
  image: 'https://example.com/logo.png',
};

describe('bogotaDateTime', () => {
  it('appends the fixed -05:00 offset and keeps seconds', () => {
    expect(bogotaDateTime('2026-10-12', '18:30:00')).toBe('2026-10-12T18:30:00-05:00');
    expect(bogotaDateTime('2026-10-12', '06:00')).toBe('2026-10-12T06:00:00-05:00');
  });
  it('refuses a malformed date or time instead of guessing', () => {
    expect(bogotaDateTime('12/10/2026', '18:30')).toBeNull();
    expect(bogotaDateTime('2026-10-12', null)).toBeNull();
  });
});

describe('sessionEventJsonLd', () => {
  it('builds a schema.org Event with every field Google requires and Al asked for', () => {
    expect(sessionEventJsonLd(SESSION)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'HYROX Simulación',
      startDate: '2026-10-12T18:30:00-05:00',
      endDate: '2026-10-12T19:30:00-05:00',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: 'CrossFit BullBox Ciudad del Río', address: 'CrossFit BullBox Ciudad del Río' },
      isAccessibleForFree: false,
      url: 'https://tribelatam.com/s/abc/',
      description: 'Bloques de estaciones',
      image: ['https://example.com/a.jpg'],
      organizer: { '@type': 'Person', name: 'Leo' },
      offers: {
        '@type': 'Offer',
        price: '25000',
        priceCurrency: 'COP',
        availability: 'https://schema.org/InStock',
        url: 'https://tribelatam.com/s/abc/',
      },
    });
  });

  it('marks a free session free and sends no offer', () => {
    const ld = sessionEventJsonLd({ ...SESSION, price_cents: null });
    expect(ld?.isAccessibleForFree).toBe(true);
    expect(ld).not.toHaveProperty('offers');
    expect(sessionEventJsonLd({ ...SESSION, price_cents: 0 })?.isAccessibleForFree).toBe(true);
  });

  it('says EventCancelled for a cancelled session rather than advertising it', () => {
    expect(sessionEventJsonLd({ ...SESSION, status: 'cancelled' })?.eventStatus).toBe(
      'https://schema.org/EventCancelled'
    );
  });

  it('never carries coordinates (sessions_public rounds them; the address is enough)', () => {
    expect(JSON.stringify(sessionEventJsonLd(SESSION))).not.toMatch(/geo|latitude|longitude/);
  });

  it('returns null without a location, a start, or any name, instead of an invalid Event', () => {
    expect(sessionEventJsonLd({ ...SESSION, location: '  ' })).toBeNull();
    expect(sessionEventJsonLd({ ...SESSION, start_time: null })).toBeNull();
    expect(sessionEventJsonLd({ ...SESSION, title: null, sport: null })).toBeNull();
  });

  it('falls back to the sport as the name, and omits an end that is not after the start', () => {
    const ld = sessionEventJsonLd({ ...SESSION, title: '', end_time: '00:30:00' });
    expect(ld?.name).toBe('HYROX');
    expect(ld).not.toHaveProperty('endDate');
  });
});

describe('partnerJsonLd', () => {
  it('builds a SportsActivityLocation with geo from the public business address', () => {
    expect(partnerJsonLd(PARTNER)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SportsActivityLocation',
      name: 'CrossFit BullBox',
      url: 'https://tribelatam.com/g/bullbox/',
      address: 'Cra 48 #20-34, Medellín',
      geo: { '@type': 'GeoCoordinates', latitude: 6.2232, longitude: -75.5761 },
      image: 'https://example.com/logo.png',
      description: 'Box en Ciudad del Río',
    });
  });
  it('omits geo when either coordinate is missing, and returns null with no name', () => {
    expect(partnerJsonLd({ ...PARTNER, lng: null })).not.toHaveProperty('geo');
    expect(partnerJsonLd({ ...PARTNER, business_name: null })).toBeNull();
  });
});

describe('serializeJsonLd', () => {
  it('cannot close the script tag, and still parses to the same value', () => {
    const value = { name: '</script><script>alert(1)</script> & co' };
    const out = serializeJsonLd(value);
    expect(out).not.toMatch(/<|>|&/);
    expect(JSON.parse(out)).toEqual(value);
  });
});

describe('sessionJsonLdInputFromRow', () => {
  it('reads each field by type, so a wrong-typed column becomes null, not a wrong value', () => {
    const row: Record<string, unknown> = { title: 'Yoga', date: '2026-10-12', start_time: 7, photos: ['p.jpg'] };
    const input = sessionJsonLdInputFromRow(row, 'u');
    expect(input.title).toBe('Yoga');
    expect(input.start_time).toBeNull();
    expect(input.image).toBe('p.jpg');
  });
});
