/**
 * App language -> date locale.
 *
 * Dates must be formatted from the language the user chose IN THE APP, never
 * from the device or the server. Reading navigator.language put an English
 * month inside a Spanish sentence -- "Solicitada el Sep 11" -- for anyone
 * running the app in Spanish on an English-locale phone, which is most phones
 * in Medellín. Calling toLocaleDateString() with no argument is the same bug
 * with a worse blast radius on the server, where the locale is the host's.
 *
 * A map rather than a ternary on `language`, so it reads as data and stays
 * clear of the i18n lint rule.
 */
const DATE_LOCALES: Record<string, string> = { es: 'es-CO', en: 'en-US' };

export function dateLocale(language: string | null | undefined): string {
  return DATE_LOCALES[language ?? 'en'] ?? DATE_LOCALES.en;
}
