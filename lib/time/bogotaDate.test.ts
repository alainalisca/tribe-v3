import { describe, it, expect } from 'vitest';
import { bogotaToday, bogotaDateOffset } from './bogotaDate';

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
