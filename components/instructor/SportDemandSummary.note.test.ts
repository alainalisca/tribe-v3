import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { stripJsComments } from '../../lib/stripJsComments';

/**
 * The demand summary must STATE THE SUPPRESSION RULE, and must not state the
 * number of suppressed sports.
 *
 * Migration 186 omits any sport with fewer than 5 athletes. Measured the day
 * it shipped: 9 shown, ELEVEN suppressed. Without the note an instructor reads
 * nine sports and concludes nobody does the rest -- absence read as zero, and
 * "nobody does Basketball" versus "four people do Basketball" are different
 * decisions for someone choosing what to teach.
 *
 * AND NOT THE COUNT. With 23 sports in the vocabulary and 9 shown, saying "11
 * suppressed" tells the reader that 3 sports have NOBODY, which they cannot
 * otherwise distinguish from the suppressed set. That is real inference, small
 * but real, and the rule alone fixes the misreading -- so the count buys
 * nothing and costs something.
 */
const FILE = 'components/instructor/SportDemandSummary.tsx';
const code = () => stripJsComments(readFileSync(FILE, 'utf8'));

describe('the demand summary states the rule, not the number', () => {
  /** NON-VACUITY: a file that failed to read satisfies every check below. */
  it('the component is readable', () => {
    expect(code().length).toBeGreaterThan(500);
  });

  it('states the suppression rule in English', () => {
    expect(code()).toContain("Sports with fewer than 5 athletes aren't shown.");
  });

  it('states it in Spanish too', () => {
    expect(code()).toContain('No se muestran los deportes con menos de 5 atletas.');
  });

  /** The number of suppressed sports must not appear in rendered copy. A
   *  count is derivable inference; the rule is not. */
  it('does NOT render a count of suppressed sports', () => {
    const rendered = code();
    expect(rendered).not.toMatch(/\d+\s*(other|otros|más|more)\s+(sports|deportes)/i);
    expect(rendered).not.toMatch(/\{suppressed|suppressedCount|hiddenCount/);
  });

  /** The RPC returns bands as text. A component that formatted a number would
   *  mean someone had changed the RPC to return one. */
  it('renders the band verbatim rather than computing from a number', () => {
    expect(code()).toContain('{d.athletes}');
    expect(code()).not.toMatch(/d\.athletes\s*[+\-*/]/);
  });
});
