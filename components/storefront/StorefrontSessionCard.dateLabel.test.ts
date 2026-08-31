// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { formatSessionDate } from '@/lib/utils';

/**
 * StorefrontSessionCard used to carry a private formatSessionDay that parsed the
 * bare YYYY-MM-DD as UTC midnight and rendered with timeZone UTC and
 * { weekday: 'short', month: 'short', day: 'numeric' }. It now calls the shared
 * formatSessionDate with those same options. The frozen strings below are the
 * exact output the private copy produced under America/Bogota, captured before
 * the swap, so this asserts the rendered label is byte identical. The witness
 * proves the zone override is live.
 */
const OPTS = { weekday: 'short', month: 'short', day: 'numeric' } as const;
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('StorefrontSessionCard date label', () => {
  it('matches the retired formatSessionDay output byte for byte under America/Bogota', () => {
    process.env.TZ = 'America/Bogota';
    expect(new Date('2026-08-23').getDate()).toBe(22); // witness: naive parse drifts

    expect(formatSessionDate('2026-08-23', 'en', OPTS)).toBe('Sun, Aug 23');
    expect(formatSessionDate('2026-08-23', 'es', OPTS)).toBe('dom, 23 de ago');
  });
});
