import { describe, it, expect } from 'vitest';
import { bogotaLocalToUtc, utcToBogotaLocal } from './bogota';

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
