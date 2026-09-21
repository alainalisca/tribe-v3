import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { stripJsComments } from './stripJsComments';

/**
 * Migration 180 moved Find Training Partners' ranking into the database so that
 * no coordinate reaches the client. This guard stops the client-side read
 * coming back.
 *
 * WHAT WAS WRONG BEFORE. fetchNearbyAthletes ran in the browser, selected
 * location_lat and location_lng from users_discoverable, and computed a
 * Haversine distance in JS. So every logged-in user's network response carried
 * the rounded coordinates of every athlete on the card -- a plain read of the
 * response, no derivation needed. Deleting the "12 km" label would have
 * removed a rendering of data the client still held.
 *
 * WHY THIS IS SCOPED TO A FILE LIST rather than banning the column names
 * repo-wide: location_lat and location_lng are read legitimately elsewhere --
 * the location picker, /api/venues/nearby, the smart-match cron. A repo-wide
 * ban would demand migrating code that has every right to them, which is the
 * same mistake a bare banner_url ban would have made against featured_partners.
 *
 * (This sentence once had to be rephrased to avoid naming that column, because
 * the cover-image guard matched it in prose. That guard now strips comments,
 * so documentation can name a retired column without tripping it. Rephrasing
 * the prose had been the cheap fix; teaching the guard to tell a mention from
 * a read is the correct one.)
 *
 * COMMENTS ARE STRIPPED BEFORE SCANNING. The files below EXPLAIN what they no
 * longer do, naming the columns while doing so. A textual guard that counted
 * those would flag the very comments documenting the fix -- the trap that kept
 * `unete` flagged after every real occurrence was corrected.
 */

/** The surface, enumerated with a reason each. A file joining this surface
 *  must be added here deliberately. */
const SURFACE: Record<string, string> = {
  'lib/dal/connections.ts': 'holds fetchTrainingPartners, the only read path for this card',
  'components/FindTrainingPartners.tsx': 'the home-feed carousel',
  'app/training-partners/page.tsx': 'the full-page browser',
  'components/TrainingPartnerCard.tsx': 'the card itself; used by both callers',
  'components/InviteToSessionSheet.tsx': 'receives a TrainingPartner and could read a field off it',
};

const FORBIDDEN = /(location_lat|location_lng|users_discoverable|Math\.atan2|6371)/;

/** Shared with lib/coverImage.singleColumn.test.ts. The first version here was
 *  a line-based regex, which truncates at the `//` inside `https://` and would
 *  have hidden any read sharing a line with a URL. */
const executable = stripJsComments;

describe('Find Training Partners never reads a coordinate client-side', () => {
  /** NON-VACUITY FIRST. Every assertion below is true of a file that does not
   *  exist or that stripped to nothing, which is exactly how a guard ends up
   *  reporting green about a population it never read. */
  it.each(Object.keys(SURFACE))('%s exists and has readable content', (file) => {
    expect(existsSync(file), `${file} is listed in SURFACE but not on disk`).toBe(true);
    const code = executable(readFileSync(file, 'utf8'));
    expect(code.trim().length, `${file} stripped to nothing; the scan below would be vacuous`).toBeGreaterThan(200);
  });

  it.each(Object.keys(SURFACE))('%s selects no coordinate and computes no distance', (file) => {
    const code = executable(readFileSync(file, 'utf8'));
    const hit = code.match(FORBIDDEN);
    expect(
      hit?.[0] ?? null,
      `${file} references ${hit?.[0]}. Ranking belongs in find_training_partners (migration 180); ` +
        'the client receives an order, never a position.'
    ).toBeNull();
  });

  /** The structural mirror of 180's own return-type guard: the type the client
   *  holds must carry no positional field either. */
  it('the TrainingPartner type carries no positional field', () => {
    const src = readFileSync('lib/dal/connections.ts', 'utf8');
    const i = src.indexOf('export interface TrainingPartner {');
    expect(i, 'TrainingPartner interface not found -- this check cannot mean anything').toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('}', i));
    const fields = body
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(/[?:]/)[0].trim())
      .filter((f) => f && !f.startsWith('/') && !f.startsWith('*'));

    // Assert the read succeeded before asserting what it found.
    expect(fields.length, 'no fields parsed out of TrainingPartner').toBeGreaterThan(2);
    expect(fields).not.toEqual(expect.arrayContaining([expect.stringMatching(/lat|lng|distance|coord/i)]));
  });

  it('the card calls the RPC wrapper, not a coordinate-taking fetch', () => {
    for (const file of ['components/FindTrainingPartners.tsx', 'app/training-partners/page.tsx']) {
      const code = executable(readFileSync(file, 'utf8'));
      expect(code, `${file} still imports the old client-ranking DAL`).not.toContain('fetchNearbyAthletes');
      expect(code, `${file} does not call the RPC wrapper`).toContain('fetchTrainingPartners');
    }
  });
});
