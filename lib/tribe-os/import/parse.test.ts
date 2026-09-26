import { describe, it, expect } from 'vitest';
import { parseImportDate, matchMemberOrder } from './parse';

describe('parseImportDate', () => {
  const tz = 'America/Bogota';

  it('parses ISO date "2026-09-24"', () => {
    expect(parseImportDate('2026-09-24', tz)).toEqual({ date: '2026-09-24' });
  });

  it('parses DD/MM/YYYY "24/09/2026" (day > 12, unambiguous)', () => {
    expect(parseImportDate('24/09/2026', tz)).toEqual({ date: '2026-09-24' });
  });

  it('parses DD/MM/YYYY "05/05/2026" (day === month, unambiguous)', () => {
    expect(parseImportDate('05/05/2026', tz)).toEqual({ date: '2026-05-05' });
  });

  it('returns ambiguous_date for "05/06/2026" (both <= 12, different)', () => {
    expect(parseImportDate('05/06/2026', tz)).toEqual({
      error: 'ambiguous_date',
    });
  });

  it('parses DD/MM/YYYY "15/01/2026" (day > 12, unambiguous)', () => {
    expect(parseImportDate('15/01/2026', tz)).toEqual({ date: '2026-01-15' });
  });

  it('returns empty for empty string', () => {
    expect(parseImportDate('', tz)).toEqual({ error: 'empty' });
  });

  it('returns invalid_format for "not-a-date"', () => {
    expect(parseImportDate('not-a-date', tz)).toEqual({
      error: 'invalid_format',
    });
  });

  it('returns invalid_format for "2026-02-30" (invalid calendar date)', () => {
    expect(parseImportDate('2026-02-30', tz)).toEqual({
      error: 'invalid_format',
    });
  });
});

describe('matchMemberOrder', () => {
  it('returns the resolution order', () => {
    expect(matchMemberOrder()).toEqual(['external_id', 'email', 'phone']);
  });
});
