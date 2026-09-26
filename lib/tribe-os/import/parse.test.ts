import { describe, it, expect } from 'vitest';
import { parseImportDate, matchMemberOrder, normalizeStatus } from './parse';

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

describe('normalizeStatus', () => {
  it('maps "Activo" to active', () => {
    expect(normalizeStatus('Activo')).toEqual({ status: 'active', tags: [] });
  });

  it('maps "activo" (lowercase) to active', () => {
    expect(normalizeStatus('activo')).toEqual({ status: 'active', tags: [] });
  });

  it('maps "Inactivo" to inactive', () => {
    expect(normalizeStatus('Inactivo')).toEqual({ status: 'inactive', tags: [] });
  });

  it('maps "Congelado" to inactive with congelado tag', () => {
    expect(normalizeStatus('Congelado')).toEqual({ status: 'inactive', tags: ['congelado'] });
  });

  it('maps unknown status to active with warning', () => {
    const result = normalizeStatus('Suspendido');
    expect(result.status).toBe('active');
    expect(result.warning).toBe('unknown_status: Suspendido');
  });

  it('defaults to active when undefined', () => {
    expect(normalizeStatus(undefined)).toEqual({ status: 'active', tags: [] });
  });

  it('handles accented input "Inàctivo"', () => {
    expect(normalizeStatus('Inàctivo')).toEqual({ status: 'inactive', tags: [] });
  });
});

describe('import result error rendering', () => {
  it('normalizes server error shape { index, reason, row } to { row, error, data }', () => {
    const serverError = {
      index: 2,
      reason: 'joined_on_ambiguous_date',
      row: { name: 'Test', email: 'test@example.com' },
    };
    const normalized = {
      row: serverError.index + 1,
      error: serverError.reason,
      data: serverError.row,
    };
    expect(normalized.row).toBe(3);
    expect(normalized.error).toBe('joined_on_ambiguous_date');
    expect(typeof normalized.error).toBe('string');
    expect(typeof normalized.row).toBe('number');
  });
});
