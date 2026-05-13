import { describe, it, expect } from 'vitest';
import { csvEscape, rowsToCsv, buildExportFilename } from './serialize';

describe('csvEscape', () => {
  it('passes through plain text unquoted', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape('Ana García')).toBe('Ana García');
  });

  it('quotes cells containing commas', () => {
    expect(csvEscape('García, Ana')).toBe('"García, Ana"');
  });

  it('quotes cells containing newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
    expect(csvEscape('line1\rline2')).toBe('"line1\rline2"');
  });

  it('doubles embedded quotes per RFC 4180', () => {
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""');
  });

  it('handles empty string', () => {
    expect(csvEscape('')).toBe('');
  });
});

describe('rowsToCsv', () => {
  it('joins rows with CRLF and escapes each cell', () => {
    const csv = rowsToCsv([
      ['name', 'notes'],
      ['Ana', 'plain'],
      ['Carlos', 'with, comma'],
    ]);
    expect(csv).toBe('name,notes\r\nAna,plain\r\nCarlos,"with, comma"');
  });

  it('handles empty rows array', () => {
    expect(rowsToCsv([])).toBe('');
  });

  it('does NOT prepend the BOM (caller responsibility)', () => {
    // The BOM lives in buildCsvResponse so rowsToCsv stays usable
    // for in-memory CSVs (tests, previews) that don't need it.
    const csv = rowsToCsv([['name'], ['Ana']]);
    expect(csv.startsWith('﻿')).toBe(false);
  });
});

describe('buildExportFilename', () => {
  it('appends YYYY-MM-DD and .csv', () => {
    const d = new Date('2026-05-13T10:00:00Z');
    expect(buildExportFilename('tribe-os-clients', d)).toBe('tribe-os-clients-2026-05-13.csv');
  });

  it('defaults to current date when not provided', () => {
    const result = buildExportFilename('foo');
    expect(result).toMatch(/^foo-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
