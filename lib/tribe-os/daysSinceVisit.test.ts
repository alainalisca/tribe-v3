import { describe, it, expect } from 'vitest';
import { daysSinceVisit } from './daysSinceVisit';

describe('daysSinceVisit', () => {
  it('returns null when visitedAt is null', () => {
    expect(daysSinceVisit(null)).toBeNull();
  });

  it('returns 0 when the visit is today in Bogota', () => {
    const now = new Date('2026-10-12T15:00:00Z');
    expect(daysSinceVisit('2026-10-12T12:00:00Z', now)).toBe(0);
  });

  it('returns correct days for a visit 18 days ago', () => {
    const now = new Date('2026-10-12T15:00:00Z');
    expect(daysSinceVisit('2026-09-24T14:00:00Z', now)).toBe(18);
  });

  it('respects Bogota timezone: 4am UTC Oct 12 is still Oct 11 in Bogota', () => {
    const now = new Date('2026-10-12T04:00:00Z');
    expect(daysSinceVisit('2026-10-11T12:00:00Z', now)).toBe(0);
  });

  it('respects Bogota timezone: 6am UTC Oct 12 is Oct 12 in Bogota', () => {
    const now = new Date('2026-10-12T06:00:00Z');
    expect(daysSinceVisit('2026-10-11T12:00:00Z', now)).toBe(1);
  });

  it('returns 0 for future visits (never negative)', () => {
    const now = new Date('2026-10-12T15:00:00Z');
    expect(daysSinceVisit('2026-10-13T12:00:00Z', now)).toBe(0);
  });

  it('Paola scenario: Sep 24 visit → Oct 12 = 18 days, not 14', () => {
    const oct12 = new Date('2026-10-12T17:00:00Z');
    expect(daysSinceVisit('2026-09-24T20:00:00Z', oct12)).toBe(18);
  });
});
