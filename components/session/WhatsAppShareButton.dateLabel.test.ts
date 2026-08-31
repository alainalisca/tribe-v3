// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { formatSessionDate } from '@/lib/utils';

/**
 * WhatsAppShareButton used to carry a private formatSessionDate that parsed the
 * bare YYYY-MM-DD as LOCAL midnight (no Z) and rendered in LOCAL time (no
 * timeZone) with { weekday: 'long', month: 'long', day: 'numeric' }. Both halves
 * were local, so it always produced the correct calendar day; the shared helper
 * (UTC parse plus timeZone UTC) yields the identical string in every zone. The
 * frozen strings below are the exact output the private copy produced under
 * America/Bogota, captured before the swap. The witness proves the zone override
 * is live.
 */
const OPTS = { weekday: 'long', month: 'long', day: 'numeric' } as const;
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('WhatsAppShareButton share-message date', () => {
  it('matches the retired formatSessionDate output byte for byte under America/Bogota', () => {
    process.env.TZ = 'America/Bogota';
    expect(new Date('2026-08-23').getDate()).toBe(22); // witness: naive parse drifts

    expect(formatSessionDate('2026-08-23', 'en', OPTS)).toBe('Sunday, August 23');
    expect(formatSessionDate('2026-08-23', 'es', OPTS)).toBe('domingo, 23 de agosto');
  });
});
