/**
 * Dates follow the app language, never the device or the server (2026-09-11).
 *
 * navigator.language put an English month in a Spanish sentence for anyone
 * running the app in Spanish on an English-locale phone. toLocaleDateString()
 * with no argument is the same bug server-side, where the locale is the host's
 * — the weekly recap emailed English dates to Spanish recipients.
 */
import { describe, it, expect } from 'vitest';
import { dateLocale } from './dateLocale';

describe('dateLocale', () => {
  it('maps the app languages to real locales', () => {
    expect(dateLocale('es')).toBe('es-CO');
    expect(dateLocale('en')).toBe('en-US');
  });

  it('falls back to English for null, undefined or an unknown language', () => {
    // The recap route reads user.preferred_language, which is nullable.
    for (const input of [null, undefined, '', 'fr', 'pt-BR']) {
      expect(dateLocale(input)).toBe('en-US');
    }
  });

  it('actually changes the rendered month, which is the point', () => {
    const date = new Date('2026-09-11T12:00:00Z');
    const es = date.toLocaleDateString(dateLocale('es'), { day: 'numeric', month: 'short' });
    const en = date.toLocaleDateString(dateLocale('en'), { day: 'numeric', month: 'short' });

    expect(es).toContain('sept');
    expect(es).toContain('de'); // Spanish renders "11 de sept" unaided
    expect(en).toContain('Sep');
    expect(es).not.toBe(en);
  });
});
