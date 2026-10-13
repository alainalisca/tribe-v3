import { describe, it, expect } from 'vitest';
import { bogotaToday, bogotaDateOffset, bogotaLocalToUtc, utcToBogotaLocal, sessionStartUtc } from './bogotaDate';

describe('bogotaToday', () => {
  it('returns YYYY-MM-DD', () => {
    expect(bogotaToday(new Date('2026-06-13T17:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is still "today" Bogota when UTC has rolled to tomorrow (the bug this fixes)', () => {
    // 2026-06-13 23:30 Bogota = 2026-06-14 04:30 UTC. The UTC date is the 14th,
    // but the Bogota date — which is what session.date stores — is still the 13th.
    const instant = new Date('2026-06-14T04:30:00Z');
    expect(bogotaToday(instant)).toBe('2026-06-13');
    // Sanity: the naive UTC approach would have returned the 14th.
    expect(instant.toISOString().split('T')[0]).toBe('2026-06-14');
  });

  it('early-morning Bogota matches the UTC date', () => {
    // 2026-06-13 08:00 Bogota = 2026-06-13 13:00 UTC.
    expect(bogotaToday(new Date('2026-06-13T13:00:00Z'))).toBe('2026-06-13');
  });
});

describe('bogotaDateOffset', () => {
  const base = new Date('2026-06-13T17:00:00Z'); // 12:00 Bogota, the 13th

  it('offset 0 equals bogotaToday', () => {
    expect(bogotaDateOffset(0, base)).toBe('2026-06-13');
  });

  it('adds days', () => {
    expect(bogotaDateOffset(1, base)).toBe('2026-06-14');
    expect(bogotaDateOffset(7, base)).toBe('2026-06-20');
  });

  it('subtracts days', () => {
    expect(bogotaDateOffset(-7, base)).toBe('2026-06-06');
  });

  it('crosses month boundaries', () => {
    expect(bogotaDateOffset(1, new Date('2026-06-30T17:00:00Z'))).toBe('2026-07-01');
  });
});

describe('bogotaLocalToUtc', () => {
  it('adds five hours to a daytime Bogotá wall-clock value', () => {
    expect(bogotaLocalToUtc('2026-10-12T07:30')).toBe('2026-10-12T12:30:00.000Z');
  });

  it('rolls to the next UTC day for a 21:00 Bogotá event', () => {
    expect(bogotaLocalToUtc('2026-10-12T21:00')).toBe('2026-10-13T02:00:00.000Z');
  });

  it('rolls to the next UTC day at 19:00, the first hour that crosses midnight', () => {
    expect(bogotaLocalToUtc('2026-10-12T18:59')).toBe('2026-10-12T23:59:00.000Z');
    expect(bogotaLocalToUtc('2026-10-12T19:00')).toBe('2026-10-13T00:00:00.000Z');
  });

  it('crosses month and year boundaries late at night', () => {
    expect(bogotaLocalToUtc('2026-10-31T23:45')).toBe('2026-11-01T04:45:00.000Z');
    expect(bogotaLocalToUtc('2026-12-31T22:00')).toBe('2027-01-01T03:00:00.000Z');
  });

  it('accepts the seconds that some browsers include', () => {
    expect(bogotaLocalToUtc('2026-10-12T21:00:30')).toBe('2026-10-13T02:00:30.000Z');
  });

  it('keeps the same offset all year, because Colombia has no daylight saving', () => {
    expect(bogotaLocalToUtc('2026-01-15T09:00')).toBe('2026-01-15T14:00:00.000Z');
    expect(bogotaLocalToUtc('2026-07-15T09:00')).toBe('2026-07-15T14:00:00.000Z');
  });

  it('returns null for empty, malformed or impossible values', () => {
    expect(bogotaLocalToUtc('')).toBeNull();
    expect(bogotaLocalToUtc('2026-10-12')).toBeNull();
    expect(bogotaLocalToUtc('not a date')).toBeNull();
    expect(bogotaLocalToUtc('2026-02-30T10:00')).toBeNull();
    expect(bogotaLocalToUtc('2026-10-12T24:00')).toBeNull();
    expect(bogotaLocalToUtc('2026-10-12T10:00Z')).toBeNull();
  });
});

describe('utcToBogotaLocal', () => {
  it('subtracts five hours and formats for a datetime-local input', () => {
    expect(utcToBogotaLocal('2026-10-12T12:30:00.000Z')).toBe('2026-10-12T07:30');
  });

  it('moves back to the previous Bogotá day for an early UTC instant', () => {
    expect(utcToBogotaLocal('2026-10-13T02:00:00.000Z')).toBe('2026-10-12T21:00');
    expect(utcToBogotaLocal('2027-01-01T03:00:00Z')).toBe('2026-12-31T22:00');
  });

  it('reads the offset form Postgres returns for timestamptz', () => {
    expect(utcToBogotaLocal('2026-10-13T02:00:00+00:00')).toBe('2026-10-12T21:00');
  });

  it('round-trips with bogotaLocalToUtc so editing an event does not shift it', () => {
    for (const local of [
      '2026-10-12T00:00',
      '2026-10-12T18:59',
      '2026-10-12T19:00',
      '2026-10-12T21:00',
      '2026-12-31T23:59',
    ]) {
      const utc = bogotaLocalToUtc(local);
      expect(utc).not.toBeNull();
      expect(utcToBogotaLocal(utc as string)).toBe(local);
    }
  });

  it('returns null for empty or unparseable values', () => {
    expect(utcToBogotaLocal('')).toBeNull();
    expect(utcToBogotaLocal('garbage')).toBeNull();
  });
});

describe('sessionStartUtc', () => {
  it('converts Bogotá date+time to correct UTC Date', () => {
    const result = sessionStartUtc('2026-10-12', '18:00');
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-10-12T23:00:00.000Z');
  });

  it('21:00 Bogotá rolls to the next UTC day', () => {
    const result = sessionStartUtc('2026-10-12', '21:00');
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-10-13T02:00:00.000Z');
  });

  it('accepts HH:MM:SS with seconds', () => {
    const result = sessionStartUtc('2026-10-12', '21:00:30');
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe('2026-10-13T02:00:30.000Z');
  });

  it('returns null for bad input', () => {
    expect(sessionStartUtc('', '10:00')).toBeNull();
    expect(sessionStartUtc('2026-10-12', '')).toBeNull();
    expect(sessionStartUtc('not-a-date', '10:00')).toBeNull();
    expect(sessionStartUtc('2026-10-12', 'not-a-time')).toBeNull();
    expect(sessionStartUtc('2026-02-30', '10:00')).toBeNull();
    expect(sessionStartUtc('2026-10-12', '25:00')).toBeNull();
  });
});
