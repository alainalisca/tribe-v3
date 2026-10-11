/**
 * Unit tests for lib/calendar.ts
 * Focus: getGoogleCalendarUrl — correct UTC date range format + encoding (BUG-224)
 */
import { describe, it, expect, vi } from 'vitest';
import { getGoogleCalendarUrl } from './calendar';

describe('getGoogleCalendarUrl', () => {
  it('returns a Google Calendar render URL', () => {
    const start = new Date('2026-07-15T10:00:00Z');
    const url = getGoogleCalendarUrl({
      title: 'Cycling — Tribe Session',
      description: 'Morning ride with Coach Ana',
      startDate: start,
      durationMinutes: 60,
      location: 'Parque El Poblado, Medellín',
    });
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  });

  it('formats dates as YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ in UTC', () => {
    // Known UTC moment: 2026-07-15 10:00 UTC  →  end = 2026-07-15 11:00 UTC
    const start = new Date('2026-07-15T10:00:00.000Z');
    const url = getGoogleCalendarUrl({
      title: 'Run',
      description: 'Easy 5k',
      startDate: start,
      durationMinutes: 60,
    });
    const params = new URL(url).searchParams;
    // toISOString strips dashes, colons and milliseconds → 20260715T100000Z/20260715T110000Z
    expect(params.get('dates')).toBe('20260715T100000Z/20260715T110000Z');
  });

  it('URL-encodes title containing special characters', () => {
    const start = new Date('2026-07-15T08:00:00.000Z');
    const url = getGoogleCalendarUrl({
      title: 'Yoga & Stretch — Tribe',
      description: 'Relaxing session',
      startDate: start,
      durationMinutes: 45,
    });
    // URLSearchParams encodes & and — automatically; URL should be parseable
    const parsed = new URL(url);
    expect(parsed.searchParams.get('text')).toBe('Yoga & Stretch — Tribe');
  });

  it('includes location when provided', () => {
    const start = new Date('2026-07-20T07:30:00.000Z');
    const url = getGoogleCalendarUrl({
      title: 'Swimming',
      description: 'Lap swim',
      startDate: start,
      durationMinutes: 90,
      location: 'Club Campestre, Cali',
    });
    const params = new URL(url).searchParams;
    expect(params.get('location')).toBe('Club Campestre, Cali');
  });

  it('uses empty string for location when not provided', () => {
    const start = new Date('2026-07-20T07:30:00.000Z');
    const url = getGoogleCalendarUrl({
      title: 'Run',
      description: 'Group run',
      startDate: start,
      durationMinutes: 30,
    });
    const params = new URL(url).searchParams;
    expect(params.get('location')).toBe('');
  });

  it('handles 90-minute duration crossing hour boundary', () => {
    const start = new Date('2026-08-01T23:00:00.000Z');
    const url = getGoogleCalendarUrl({
      title: 'Night ride',
      description: 'Evening cycling',
      startDate: start,
      durationMinutes: 90,
    });
    const params = new URL(url).searchParams;
    // 23:00 + 90 min = 00:30 next day
    expect(params.get('dates')).toBe('20260801T230000Z/20260802T003000Z');
  });
});

describe('downloadICS links to the canonical host', () => {
  it('uses tribelatam.com, not the page origin (the native app runs on tribe-v3.vercel.app)', async () => {
    const { downloadICS } = await import('./calendar');
    let captured: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      captured = b as Blob;
      return 'blob:test';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      downloadICS({ sport: 'Running', date: '2026-10-20', start_time: '07:00', location: 'Parque', sessionId: 'abc' });
      expect(captured, 'downloadICS never built the file').toBeDefined();
      const ics = await captured!.text();
      expect(ics).toContain('URL:https://tribelatam.com/session/abc/');
      expect(window.location.origin).not.toBe('https://tribelatam.com');
      expect(ics).not.toContain(window.location.origin);
    } finally {
      create.mockRestore();
      revoke.mockRestore();
      click.mockRestore();
    }
  });
});
