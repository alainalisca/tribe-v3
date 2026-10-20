import type { Language } from './translate';

/**
 * T-LANG1: the one rule for "which language does this person read".
 *
 * users.preferred_language cannot tell a choice from a default: the column
 * defaulted to 'en' for every row, so on 2026-10-19 110 of 119 accounts read
 * 'en' in a Medellín product where almost nobody had touched the toggle
 * (docs/TICKET-preferred-language-default.md). Migration 226 adds
 * preferred_language_set_at, written only by setLanguage in
 * lib/LanguageContext.tsx when a person picks a language. So:
 *
 *   set_at present -> the stored value (anything but 'en' reads Spanish)
 *   set_at absent  -> Spanish, the market's language
 *
 * Every sender that writes to someone else (push, in-app bell, email, SMS)
 * selects LANGUAGE_FIELDS and calls recipientLanguage. This module is
 * deliberately tiny and imports no message files, so the root language
 * provider can use it without pulling both dictionaries into every page.
 */
export const LANGUAGE_FIELDS = 'preferred_language, preferred_language_set_at';

export interface LanguagePreference {
  preferred_language?: string | null;
  preferred_language_set_at?: string | null;
}

export function recipientLanguage(row: LanguagePreference | null | undefined): Language {
  if (!row?.preferred_language_set_at) return 'es';
  return row.preferred_language === 'en' ? 'en' : 'es';
}

/** The stored choice, or null when the person never chose (the UI then falls back to the browser). */
export function chosenLanguage(row: LanguagePreference | null | undefined): Language | null {
  if (!row?.preferred_language_set_at) return null;
  return row.preferred_language === 'en' ? 'en' : row.preferred_language === 'es' ? 'es' : null;
}
