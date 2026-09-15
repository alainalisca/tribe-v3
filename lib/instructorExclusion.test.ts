import { describe, it, expect } from 'vitest';
import { buildExclusionFilter, excludeOrganizations } from './instructorExclusion';

const BULLBOX_USER = '7c4e29a2-7689-4e83-8787-113ebd2c6a42';
const LEO = '0df617e9-7547-4a8d-a0b1-8be4d52a673a';

describe('buildExclusionFilter', () => {
  it('builds a PostgREST in-list when a gym exists', () => {
    expect(buildExclusionFilter([BULLBOX_USER])).toBe(`(${BULLBOX_USER})`);
  });

  it('returns null rather than "()" when there is no gym', () => {
    // `.not('id','in','()')` is a syntax error that breaks the entire
    // instructor list. This was the live state until a gym partner existed,
    // so the naive version would have shipped broken and looked fine.
    expect(buildExclusionFilter([])).toBeNull();
    expect(buildExclusionFilter(null)).toBeNull();
    expect(buildExclusionFilter(undefined)).toBeNull();
  });

  it('ignores empty strings rather than emitting a trailing comma', () => {
    expect(buildExclusionFilter(['', BULLBOX_USER, ''])).toBe(`(${BULLBOX_USER})`);
  });

  it('de-duplicates', () => {
    expect(buildExclusionFilter([BULLBOX_USER, BULLBOX_USER])).toBe(`(${BULLBOX_USER})`);
  });
});

describe('excludeOrganizations', () => {
  const rows = [
    { id: LEO, name: 'Leo Garcia' },
    { id: BULLBOX_USER, name: 'BullBox' },
  ];

  it('drops the gym account and keeps the people', () => {
    // The assertion a browser cannot make: BullBox is absent BECAUSE of this
    // rule, not because its profile happens to be incomplete.
    const out = excludeOrganizations(rows, [BULLBOX_USER]);
    expect(out.map((r) => r.name)).toEqual(['Leo Garcia']);
  });

  it('keeps the gym when it is NOT in the exclusion list', () => {
    // The other half, and the one that proves the first is meaningful: with an
    // empty list BullBox survives, so the filter is doing the work.
    const out = excludeOrganizations(rows, []);
    expect(out.map((r) => r.name)).toEqual(['Leo Garcia', 'BullBox']);
  });

  it('never drops an instructor who merely coaches at a gym', () => {
    // Leo is on BullBox's roster. He is a person and belongs in the list; only
    // the gym's own account is excluded.
    expect(excludeOrganizations(rows, [BULLBOX_USER]).some((r) => r.id === LEO)).toBe(true);
  });

  it('returns the rows untouched when there is nothing to exclude', () => {
    expect(excludeOrganizations(rows, null)).toBe(rows);
  });
});
