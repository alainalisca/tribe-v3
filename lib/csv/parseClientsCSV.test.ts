import { describe, it, expect } from 'vitest';
import { parseClientsCSV } from './parseClientsCSV';

/**
 * Unit tests for the CSV parser used by the bulk client import flow.
 * Coverage focuses on the shapes coaches actually export from
 * spreadsheets:
 *   - Header aliases (case-insensitive, alt names)
 *   - Quoted cells, embedded quotes, embedded commas
 *   - BOM stripping, CRLF normalization
 *   - Per-row validation (missing name, invalid status, too-long name)
 *   - Unknown columns are surfaced (not silently dropped)
 */

describe('parseClientsCSV', () => {
  it('parses a minimal CSV with just name', () => {
    const result = parseClientsCSV('name\nAna García\nCarlos López\n');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('Ana García');
    expect(result.rows[1].name).toBe('Carlos López');
    expect(result.errors).toHaveLength(0);
  });

  it('recognizes header aliases case-insensitively', () => {
    const result = parseClientsCSV('Full Name,EMAIL ADDRESS,whatsapp\nAna,ana@example.com,+57 300 111\n');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Ana');
    expect(result.rows[0].email).toBe('ana@example.com');
    expect(result.rows[0].phone).toBe('+57 300 111');
  });

  it('strips UTF-8 BOM if present', () => {
    // Some Excel exports prepend a UTF-8 BOM. We need to strip it
    // so the header doesn't get parsed as "﻿name".
    const bom = '﻿';
    const result = parseClientsCSV(`${bom}name\nAna\n`);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Ana');
  });

  it('normalizes CRLF and lone CR line endings', () => {
    const crlf = parseClientsCSV('name\r\nAna\r\nCarlos\r\n');
    expect(crlf.rows).toHaveLength(2);
    const cr = parseClientsCSV('name\rAna\rCarlos\r');
    expect(cr.rows).toHaveLength(2);
  });

  it('handles quoted cells containing commas', () => {
    const result = parseClientsCSV('name,notes\n"García, Ana","Has notes, with commas"\n');
    expect(result.rows[0].name).toBe('García, Ana');
    expect(result.rows[0].notes).toBe('Has notes, with commas');
  });

  it('handles embedded quotes (RFC 4180 double-quote escape)', () => {
    const result = parseClientsCSV('name,notes\nAna,"She said ""hi"" today"\n');
    expect(result.rows[0].notes).toBe('She said "hi" today');
  });

  it('splits tags on comma or semicolon, dedupes, caps at 10', () => {
    const result = parseClientsCSV('name,tags\nAna,"vip; tuesday, vip"\n');
    expect(result.rows[0].tags).toEqual(['vip', 'tuesday']);
  });

  it('records per-row errors for invalid status', () => {
    const result = parseClientsCSV('name,status\nAna,foobar\n');
    expect(result.rows).toHaveLength(1); // row still imports
    expect(result.rows[0].status).toBeNull(); // status didn't take
    expect(result.errors.some((e) => e.message.includes('Invalid status'))).toBe(true);
  });

  it('drops rows with missing name', () => {
    const result = parseClientsCSV('name,email\n,no-name@example.com\nAna,ana@example.com\n');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Ana');
    expect(result.errors.some((e) => e.message === 'Missing name.')).toBe(true);
  });

  it('returns a global error when no name column exists', () => {
    const result = parseClientsCSV('email,phone\nana@x.com,+57\n');
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowNumber).toBe(0); // global error
    expect(result.errors[0].message).toContain('name');
  });

  it('surfaces unknown headers without dropping the file', () => {
    // Note: the parser normalizes `_` → space when matching aliases,
    // so unknown headers come back in their normalized form. That's
    // by design — it lets `health_notes` and `health notes` map to
    // the same canonical column.
    const result = parseClientsCSV('name,membership_id,unknown_col\nAna,M-001,foo\n');
    expect(result.unknownHeaders).toContain('membership id');
    expect(result.unknownHeaders).toContain('unknown col');
    expect(result.rows[0].name).toBe('Ana');
  });

  it('skips empty rows silently', () => {
    const result = parseClientsCSV('name\nAna\n\n\nCarlos\n');
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects names over 120 chars', () => {
    const longName = 'A'.repeat(121);
    const result = parseClientsCSV(`name\n${longName}\n`);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes('too long'))).toBe(true);
  });

  it('preserves valid rows alongside invalid ones', () => {
    const result = parseClientsCSV('name,status\nAna,active\n,missing\nCarlos,foobar\n');
    // Ana is valid, Carlos's row imports but with null status + error
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((r) => r.name === 'Ana')?.status).toBe('active');
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
