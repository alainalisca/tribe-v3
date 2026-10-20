// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { formatSessionDate } from '@/lib/utils';

/**
 * The feed card renders a session's calendar date with
 * formatSessionDate(session.date, language). sessions.date is a bare
 * YYYY-MM-DD (a Medellin calendar date), so the day must not drift when the
 * viewer's device is in a negative-offset zone. Tests run under
 * TZ=America/Bogota; the witness proves the zone override is live, so a naive
 * local parse of the same string would land on the 22nd.
 */
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('feed page session date label', () => {
  it('renders the real calendar day (23), not the day before, under America/Bogota', () => {
    process.env.TZ = 'America/Bogota';
    expect(new Date('2026-08-23').getDate()).toBe(22); // witness: naive parse drifts

    expect(formatSessionDate('2026-08-23', 'en')).toBe('8/23/2026');
    expect(formatSessionDate('2026-08-23', 'es')).toBe('23/8/2026');
  });
});
