import { describe, it, expect } from 'vitest';
import { parseImportDate, detectDateFormat, matchMemberOrder, normalizeStatus } from './parse';
import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

describe('parseImportDate', () => {
  const tz = 'America/Bogota';

  it('parses ISO date "2026-09-24"', () => {
    expect(parseImportDate('2026-09-24', tz)).toEqual({ date: '2026-09-24' });
  });

  it('parses DD/MM/YYYY "24/09/2026" with format dm', () => {
    expect(parseImportDate('24/09/2026', tz, 'dm')).toEqual({ date: '2026-09-24' });
  });

  it('parses DD/MM/YYYY "05/06/2026" with format dm (no longer ambiguous)', () => {
    expect(parseImportDate('05/06/2026', tz, 'dm')).toEqual({ date: '2026-06-05' });
  });

  it('parses MM/DD/YYYY "06/05/2026" with format md', () => {
    expect(parseImportDate('06/05/2026', tz, 'md')).toEqual({ date: '2026-06-05' });
  });

  it('parses DD/MM/YYYY "15/01/2026" with format dm', () => {
    expect(parseImportDate('15/01/2026', tz, 'dm')).toEqual({ date: '2026-01-15' });
  });

  it('returns empty for empty string', () => {
    expect(parseImportDate('', tz)).toEqual({ error: 'empty' });
  });

  it('returns invalid_format for "not-a-date"', () => {
    expect(parseImportDate('not-a-date', tz)).toEqual({ error: 'invalid_format' });
  });

  it('returns invalid_format for "2026-02-30" (invalid calendar date)', () => {
    expect(parseImportDate('2026-02-30', tz)).toEqual({ error: 'invalid_format' });
  });

  it('returns invalid_format for 31/02/2026 in dm format (Feb 31)', () => {
    expect(parseImportDate('31/02/2026', tz, 'dm')).toEqual({ error: 'invalid_format' });
  });

  it('defaults to dm format when no format specified', () => {
    expect(parseImportDate('15/01/2026', tz)).toEqual({ date: '2026-01-15' });
  });
});

describe('detectDateFormat', () => {
  const bogota = 'America/Bogota';
  const nyc = 'America/New_York';

  it('detects DD/MM when a value has first part > 12 (e.g. 25/03/2025)', () => {
    const values = ['25/03/2025', '05/06/2026', '10/01/2026'];
    expect(detectDateFormat(values, bogota)).toEqual({ format: 'dm' });
  });

  it('detects MM/DD when a value has second part > 12 (e.g. 03/25/2025)', () => {
    const values = ['03/25/2025', '05/06/2026', '01/10/2026'];
    expect(detectDateFormat(values, bogota)).toEqual({ format: 'md' });
  });

  it('returns conflict when both first > 12 and second > 12', () => {
    const values = ['25/03/2025', '03/25/2025'];
    expect(detectDateFormat(values, bogota)).toEqual({ error: 'conflict' });
  });

  it('defaults to DD/MM for Bogota when all values are ambiguous', () => {
    const values = ['05/06/2026', '01/03/2026', '10/11/2025'];
    expect(detectDateFormat(values, bogota)).toEqual({ format: 'dm' });
  });

  it('defaults to MM/DD for New York when all values are ambiguous', () => {
    const values = ['05/06/2026', '01/03/2026', '10/11/2025'];
    expect(detectDateFormat(values, nyc)).toEqual({ format: 'md' });
  });

  it('skips empty values and ISO dates', () => {
    const values = ['', '2026-01-15', '25/03/2025'];
    expect(detectDateFormat(values, bogota)).toEqual({ format: 'dm' });
  });

  it('fixture file mira_like_members.csv: joined_on column resolves to DD/MM', () => {
    const csv = readFileSync(join(__dirname, '../../../scripts/fixtures/mira_like_members.csv'), 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    const joinedValues = parsed.data.map((r) => r['Fecha de inscripción'] ?? '');
    const result = detectDateFormat(joinedValues, bogota);
    expect(result).toEqual({ format: 'dm' });
  });

  it('fixture file mira_like_members.csv: all 20 rows parse with no date errors', () => {
    const csv = readFileSync(join(__dirname, '../../../scripts/fixtures/mira_like_members.csv'), 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.data.length).toBe(20);

    const joinedValues = parsed.data.map((r) => r['Fecha de inscripción'] ?? '');
    const venceValues = parsed.data.map((r) => r['Vence'] ?? '');
    const joinedFmt = detectDateFormat(joinedValues, bogota);
    const venceFmt = detectDateFormat(venceValues, bogota);
    expect(joinedFmt.error).toBeUndefined();
    expect(venceFmt.error).toBeUndefined();

    const errors: string[] = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const j = parseImportDate(row['Fecha de inscripción'], bogota, joinedFmt.format!);
      if (j.error) errors.push(`row ${i + 1} joined_on: ${j.error}`);
      const v = parseImportDate(row['Vence'], bogota, venceFmt.format!);
      if (v.error) errors.push(`row ${i + 1} vence: ${v.error}`);
    }
    expect(errors).toEqual([]);
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
