/**
 * Call-site guard for the community event time zone fix.
 *
 * lib/dates/bogota.test.ts proves the conversion. It cannot see whether this
 * page uses it: the original defect was `new Date(eventAt).toISOString()` on a
 * datetime-local value, which reads the value in the device zone, and putting
 * that line back leaves every helper test green. So this asserts on source.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PAGE = path.join(__dirname, 'page.tsx');

function code(): string {
  // Comments out, so prose explaining the old bug cannot satisfy or trip this.
  return fs
    .readFileSync(PAGE, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('community event page time zone', () => {
  it('converts both datetime-local values through bogotaLocalToUtc', () => {
    const src = code();
    expect(src).toContain("from '@/lib/time/bogotaDate'");
    expect(src).toMatch(/bogotaLocalToUtc\(eventAt\)/);
    expect(src).toMatch(/bogotaLocalToUtc\(endsAt\)/);
  });

  it('never parses the raw input values with the device time zone', () => {
    const src = code();
    expect(src).not.toMatch(/new Date\(\s*(eventAt|endsAt)\s*\)/);
    expect(src).not.toMatch(/Date\.parse\(\s*(eventAt|endsAt)\s*\)/);
  });

  it('writes the converted values, not the raw ones', () => {
    const src = code();
    expect(src).toMatch(/event_at:\s*eventAtUtc\b/);
    expect(src).toMatch(/ends_at:\s*endsAtUtc\b/);
  });
});
