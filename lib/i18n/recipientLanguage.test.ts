import { describe, it, expect } from 'vitest';
import { recipientLanguage, chosenLanguage } from './recipientLanguage';

/** T-LANG1: the stored language counts only when the person chose it. */
const CHOSE = '2026-10-20T12:00:00Z';

describe('recipientLanguage (every sender)', () => {
  it('a chosen language is used', () => {
    expect(recipientLanguage({ preferred_language: 'en', preferred_language_set_at: CHOSE })).toBe('en');
    expect(recipientLanguage({ preferred_language: 'es', preferred_language_set_at: CHOSE })).toBe('es');
  });

  it("an unchosen 'en' (the old column default) reads Spanish", () => {
    expect(recipientLanguage({ preferred_language: 'en', preferred_language_set_at: null })).toBe('es');
    expect(recipientLanguage({ preferred_language: 'en' })).toBe('es');
  });

  it('NULL, a missing row, or an unknown value reads Spanish', () => {
    expect(recipientLanguage({ preferred_language: null, preferred_language_set_at: null })).toBe('es');
    expect(recipientLanguage(null)).toBe('es');
    expect(recipientLanguage(undefined)).toBe('es');
    expect(recipientLanguage({ preferred_language: 'pt', preferred_language_set_at: CHOSE })).toBe('es');
  });
});

describe('chosenLanguage (the UI: null lets the browser decide)', () => {
  it('returns the choice, or null when there is none', () => {
    expect(chosenLanguage({ preferred_language: 'en', preferred_language_set_at: CHOSE })).toBe('en');
    expect(chosenLanguage({ preferred_language: 'es', preferred_language_set_at: CHOSE })).toBe('es');
    expect(chosenLanguage({ preferred_language: 'en', preferred_language_set_at: null })).toBeNull();
    expect(chosenLanguage({ preferred_language: null, preferred_language_set_at: null })).toBeNull();
    expect(chosenLanguage({ preferred_language: 'pt', preferred_language_set_at: CHOSE })).toBeNull();
    expect(chosenLanguage(null)).toBeNull();
  });
});
