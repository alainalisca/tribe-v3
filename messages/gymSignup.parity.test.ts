import { describe, it, expect } from 'vitest';
import en from './en.json';
import es from './es.json';

/**
 * A missing Spanish key does not throw -- useTranslations falls back to English
 * (lib/i18n/useTranslations.ts:27-29) -- so a half-translated group ships
 * silently and only shows up to a Spanish-speaking user.
 */
describe('gymSignup i18n', () => {
  const e = (en as unknown as Record<string, Record<string, string>>).gymSignup;
  const s = (es as unknown as Record<string, Record<string, string>>).gymSignup;

  it('exists in both languages', () => {
    expect(e).toBeTruthy();
    expect(s).toBeTruthy();
  });

  it('has identical key sets', () => {
    expect(Object.keys(s).sort()).toEqual(Object.keys(e).sort());
  });

  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(e)) expect(v.trim(), `en.${k}`).not.toBe('');
    for (const [k, v] of Object.entries(s)) expect(v.trim(), `es.${k}`).not.toBe('');
  });

  it('is actually translated, not copied', () => {
    // A handful of keys could legitimately match across languages; the copy for
    // the role card and the validation messages could not.
    for (const k of ['roleTitle', 'roleDesc', 'errBusinessNameRequired', 'duplicateApplication']) {
      expect(s[k], k).not.toBe(e[k]);
    }
  });

  it('keeps the {name} placeholder in both', () => {
    expect(e.submittedBusiness).toContain('{name}');
    expect(s.submittedBusiness).toContain('{name}');
  });
});
