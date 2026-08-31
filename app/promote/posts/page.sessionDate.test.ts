// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { formatSessionDate } from '@/lib/utils';

/**
 * The posts session pickers render a session's date with
 * formatSessionDate(session.date, language). These sites previously called
 * toLocaleDateString() with no locale and no timeZone, so they rendered in the
 * device's default locale AND local time: under America/Bogota that showed the
 * PREVIOUS calendar day. This now pins to the app language (en-US or es-CO) and
 * to the real Medellin calendar day. The witness proves the zone override is
 * live.
 */
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('posts page session date label', () => {
  it('renders the real calendar day (23), not the day before, under America/Bogota', () => {
    process.env.TZ = 'America/Bogota';
    expect(new Date('2026-08-23').getDate()).toBe(22); // witness: naive parse drifts

    expect(formatSessionDate('2026-08-23', 'en')).toBe('8/23/2026');
    expect(formatSessionDate('2026-08-23', 'es')).toBe('23/8/2026');
  });
});
