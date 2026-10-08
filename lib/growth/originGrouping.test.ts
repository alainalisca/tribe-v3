/**
 * T-GROW1 part F arithmetic.
 *
 * WHAT IS WORTH TESTING. The addition is not: summing four integers is not where
 * a reporting table goes wrong. What goes wrong is WHICH ROWS GET ADDED TOGETHER,
 * and every arm here is a way two rows could merge that must not, or fail to
 * merge when they must:
 *
 *   NULL is a key          the untagged row is the biggest row in this table
 *   the sentinel           `?src=null` must not land in the untagged row
 *   the separator          src=run,code=club must not merge with src=runc,code=lub
 *   collapsing             grouping by campaign must add across src values
 *   a rate with no leads   a dash, not "0%", which claims a measurement
 *
 * The separator and sentinel arms are the ones that would be easy to leave out,
 * and they are the only two that can produce a WRONG NUMBER rather than a missing
 * one. A wrong number in this table reads exactly as confidently as a right one.
 */
import { describe, it, expect } from 'vitest';
import {
  ORIGIN_RANGES,
  groupOriginRows,
  isOriginGrouping,
  isOriginRange,
  originRangeSince,
  showUpRate,
  totalOrigin,
  type OriginRow,
} from './originGrouping';

const row = (over: Partial<OriginRow>): OriginRow => ({
  src: null,
  code: null,
  utm_campaign: null,
  attr_ref: null,
  visits: 0,
  leads: 0,
  contacted: 0,
  attended: 0,
  ...over,
});

describe('groupOriginRows', () => {
  it('keeps distinct src/code pairs apart and sums their counts', () => {
    const out = groupOriginRows(
      [
        row({ src: 'runclub', code: 'RC-01', visits: 10, leads: 3, contacted: 2, attended: 1 }),
        row({ src: 'instagram', code: 'IG-01', visits: 40, leads: 2, contacted: 1, attended: 0 }),
      ],
      'src_code'
    );
    expect(out).toHaveLength(2);
    // Sorted by leads descending, so the channel that produced people is first.
    expect(out[0]).toMatchObject({ src: 'runclub', code: 'RC-01', visits: 10, leads: 3, attended: 1 });
    expect(out[1]).toMatchObject({ src: 'instagram', leads: 2 });
  });

  it('merges rows that differ ONLY in a collapsed dimension', () => {
    const out = groupOriginRows(
      [
        row({ src: 'runclub', code: 'RC-01', utm_campaign: 'hyrox-oct', visits: 5, leads: 1 }),
        row({ src: 'runclub', code: 'RC-01', utm_campaign: 'hyrox-nov', visits: 7, leads: 2 }),
      ],
      'src_code'
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ src: 'runclub', code: 'RC-01', visits: 12, leads: 3 });
    // The collapsed dimension is nulled rather than carrying one of the two
    // values, which would be a row labelled with a campaign whose numbers include
    // another campaign's.
    expect(out[0].utm_campaign).toBeNull();
  });

  it('groups by campaign ACROSS different src values', () => {
    const out = groupOriginRows(
      [
        row({ src: 'instagram', utm_campaign: 'hyrox-oct', visits: 30, leads: 2 }),
        row({ src: 'whatsapp', utm_campaign: 'hyrox-oct', visits: 10, leads: 3 }),
        row({ src: 'instagram', utm_campaign: 'open-day', visits: 5, leads: 0 }),
      ],
      'utm_campaign'
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ utm_campaign: 'hyrox-oct', visits: 40, leads: 5 });
    expect(out[0].src).toBeNull();
    expect(out[1]).toMatchObject({ utm_campaign: 'open-day', visits: 5, leads: 0 });
  });

  it('treats NULL as a real key and keeps the untagged row intact', () => {
    const out = groupOriginRows(
      [
        row({ src: null, code: null, visits: 3, leads: 2 }),
        row({ src: null, code: null, visits: 4, leads: 1 }),
        row({ src: 'runclub', code: 'RC-01', visits: 1, leads: 1 }),
      ],
      'src_code'
    );
    expect(out).toHaveLength(2);
    const untagged = out.find((g) => g.src === null && g.code === null);
    // THE BIGGEST ROW IN THIS TABLE TODAY, and the one T-GROW exists to shrink.
    // A grouping that dropped it would make the funnel look clean by hiding the
    // leads nobody can attribute.
    expect(untagged).toMatchObject({ visits: 7, leads: 3 });
  });

  it('does NOT merge a literal src of "null" into the untagged row', () => {
    // THE SENTINEL ARM. `?src=null` is a reachable value: sanitizeTag's charset
    // admits it and lowercases it. A sentinel of 'null' -- or String(null), which
    // is the same thing by accident -- would merge a real channel into the row
    // nobody examines, and the counts would both be wrong with nothing to show it.
    const out = groupOriginRows(
      [row({ src: null, code: null, visits: 100, leads: 10 }), row({ src: 'null', code: null, visits: 1, leads: 1 })],
      'src_code'
    );
    expect(out).toHaveLength(2);
    expect(out.find((g) => g.src === null)).toMatchObject({ visits: 100, leads: 10 });
    expect(out.find((g) => g.src === 'null')).toMatchObject({ visits: 1, leads: 1 });
  });

  it('does NOT merge two pairs whose concatenations are equal', () => {
    // THE SEPARATOR ARM. With the parts joined by '', src='run' code='club' and
    // src='runc' code='lub' both key as "runclub" and become one row whose counts
    // are the sum of two unrelated channels.
    const out = groupOriginRows(
      [row({ src: 'run', code: 'club', visits: 1, leads: 1 }), row({ src: 'runc', code: 'lub', visits: 2, leads: 2 })],
      'src_code'
    );
    expect(out).toHaveLength(2);
    expect(out.find((g) => g.src === 'run')).toMatchObject({ code: 'club', leads: 1 });
    expect(out.find((g) => g.src === 'runc')).toMatchObject({ code: 'lub', leads: 2 });
  });

  it('does not confuse an absent part with an empty one', () => {
    // The sentinel and the separator are different characters for this case: with
    // one character doing both jobs, (null, 'a') and ('', 'a') could key alike.
    // The sanitizers never produce '', so this is defence rather than a live bug,
    // and it is one line of test for a whole class.
    const out = groupOriginRows(
      [row({ src: null, code: 'a', leads: 1 }), row({ src: '', code: 'a', leads: 2 })],
      'src_code'
    );
    expect(out).toHaveLength(2);
  });

  it('is empty for no rows, rather than throwing', () => {
    expect(groupOriginRows([], 'src_code')).toEqual([]);
    expect(totalOrigin([])).toEqual({ visits: 0, leads: 0, contacted: 0, attended: 0 });
  });

  it('orders totally, so two renders of the same data agree', () => {
    // Every count equal, so only the final tie-breaker decides. Without it the
    // order would depend on Map insertion and the table would reshuffle between
    // refreshes, which is how a reader stops trusting a report.
    const rows = [row({ src: 'b', leads: 1 }), row({ src: 'a', leads: 1 }), row({ src: 'c', leads: 1 })];
    const first = groupOriginRows(rows, 'src_code').map((g) => g.src);
    const again = groupOriginRows([...rows].reverse(), 'src_code').map((g) => g.src);
    expect(first).toEqual(again);
  });
});

describe('totalOrigin', () => {
  it('sums the GROUPS, so the total always matches the rows on screen', () => {
    const groups = groupOriginRows(
      [
        row({ src: 'a', visits: 10, leads: 3, contacted: 2, attended: 1 }),
        row({ src: 'b', visits: 5, leads: 1, contacted: 0, attended: 0 }),
      ],
      'src_code'
    );
    // Computed from what is rendered rather than from the raw rows. A total
    // recomputed independently can disagree with the table above it, which is the
    // failure CLAUDE.md records as tiles counting a different population from the
    // list they sit on top of.
    expect(totalOrigin(groups)).toEqual({ visits: 15, leads: 4, contacted: 2, attended: 1 });
  });
});

describe('showUpRate', () => {
  it('is a rounded percentage of leads', () => {
    expect(showUpRate({ leads: 4, attended: 1 })).toBe(25);
    expect(showUpRate({ leads: 3, attended: 1 })).toBe(33);
    expect(showUpRate({ leads: 2, attended: 2 })).toBe(100);
  });

  it('is NULL and not 0 when there are no leads', () => {
    // A channel with no leads has no show-up rate. Rendering "0%" claims a
    // measurement that was never taken -- the same reason migration 213 returns no
    // signups column rather than a column of zeros.
    expect(showUpRate({ leads: 0, attended: 0 })).toBeNull();
    expect(showUpRate({ leads: -1, attended: 0 })).toBeNull();
  });
});

describe('ranges', () => {
  it('originRangeSince is null for all time and an instant otherwise', () => {
    const now = Date.parse('2026-10-08T12:00:00Z');
    expect(originRangeSince(null, now)).toBeNull();
    expect(originRangeSince(7, now)).toBe('2026-10-01T12:00:00.000Z');
    expect(originRangeSince(90, now)).toBe('2026-07-10T12:00:00.000Z');
  });

  it('validates what arrives over the wire', () => {
    for (const r of ORIGIN_RANGES) expect(isOriginRange(r)).toBe(true);
    for (const bad of [1, 365, '7', undefined, {}, NaN]) expect(isOriginRange(bad)).toBe(false);
    for (const g of ['src_code', 'utm_campaign', 'attr_ref']) expect(isOriginGrouping(g)).toBe(true);
    for (const bad of ['src', 'ref', '', null, 1]) expect(isOriginGrouping(bad)).toBe(false);
  });
});
