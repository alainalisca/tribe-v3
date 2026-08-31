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

/**
 * The picker labels each option `${session.title || session.sport} - <date>`.
 * session.title is NULL on every production session, so the label must fall
 * back to sport instead of rendering a bare " - date". title wins when present
 * because it is more specific, matching the sport-only sibling pickers in
 * promo-codes and boosts while degrading to the same result when title is null.
 */
function optionLabel(session: { title: string | null; sport: string; date: string }, language: 'en' | 'es'): string {
  return `${session.title || session.sport} - ${formatSessionDate(session.date, language)}`;
}

describe('posts page session date label', () => {
  it('renders the real calendar day (23), not the day before, under America/Bogota', () => {
    process.env.TZ = 'America/Bogota';
    expect(new Date('2026-08-23').getDate()).toBe(22); // witness: naive parse drifts

    expect(formatSessionDate('2026-08-23', 'en')).toBe('8/23/2026');
    expect(formatSessionDate('2026-08-23', 'es')).toBe('23/8/2026');
  });

  it('falls back to sport when title is null so the label is never empty', () => {
    process.env.TZ = 'America/Bogota';
    const label = optionLabel({ title: null, sport: 'Running', date: '2026-08-23' }, 'en');
    expect(label).toContain('Running');
    expect(label).toBe('Running - 8/23/2026');
  });

  it('prefers title over sport when title is present', () => {
    process.env.TZ = 'America/Bogota';
    const label = optionLabel({ title: 'Sunrise 5K', sport: 'Running', date: '2026-08-23' }, 'en');
    expect(label).toBe('Sunrise 5K - 8/23/2026');
  });
});
