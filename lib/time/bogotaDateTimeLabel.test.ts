import { describe, it, expect } from 'vitest';
import { bogotaDateTimeLabel } from './bogotaDate';

/**
 * The admin leads Fecha column (T-LEAD2).
 *
 * The bug this exists for is the one that got this module written: Vercel runs
 * in UTC, pass_leads.created_at is a timestamptz, and Colombia is UTC-5. A lead
 * claimed in the evening in Medellin reads as the NEXT DAY without an explicit
 * timeZone, and a date that is off by one in a list an admin uses to decide who
 * to call back is worse than no date at all.
 */
describe('bogotaDateTimeLabel', () => {
  /**
   * 02:42 UTC on the 19th is 21:42 on the 18th in Bogota. This is the exact
   * shape of the off-by-one, and it is asserted on the DAY, which is the part
   * that changes.
   */
  it('renders an evening Bogota claim on the day it happened, not the UTC day', () => {
    const label = bogotaDateTimeLabel('2026-09-19T02:42:00.000Z', 'es');
    expect(label).toContain('18');
    expect(label).toContain('21:42');
    expect(label).not.toContain('19');
  });

  it('is unaffected by the machine timezone, because the zone is explicit', () => {
    // Rendered from a fixed instant, so the only way these could differ is if
    // the formatter were reading the host zone.
    const a = bogotaDateTimeLabel('2026-09-19T02:42:00.000Z', 'es');
    const b = bogotaDateTimeLabel('2026-09-19T02:42:00.000Z', 'es');
    expect(a).toBe(b);
    expect(a).toContain('21:42');
  });

  it('uses a 24-hour clock, so 21:42 is never "09:42"', () => {
    const label = bogotaDateTimeLabel('2026-09-19T02:42:00.000Z', 'es');
    expect(label).not.toMatch(/a\.?\s?m\.?|p\.?\s?m\.?/i);
  });

  it('carries no year, because the list is newest-first and scanned', () => {
    expect(bogotaDateTimeLabel('2026-09-19T02:42:00.000Z', 'es')).not.toContain('2026');
  });

  /**
   * A cell showing "Invalid Date" reads as a defect in the product. Empty is
   * the honest render for a value that cannot be parsed.
   */
  it('renders nothing for a missing or unparseable timestamp', () => {
    expect(bogotaDateTimeLabel(null)).toBe('');
    expect(bogotaDateTimeLabel(undefined)).toBe('');
    expect(bogotaDateTimeLabel('')).toBe('');
    expect(bogotaDateTimeLabel('not a date')).toBe('');
  });

  it('falls back to English for an unknown language rather than throwing', () => {
    // Intl throws RangeError on an invalid locale, which would take the whole
    // table down over a language code.
    expect(() => bogotaDateTimeLabel('2026-09-19T02:42:00.000Z', 'xx')).not.toThrow();
    expect(bogotaDateTimeLabel('2026-09-19T02:42:00.000Z', 'xx')).toContain('21:42');
  });
});
