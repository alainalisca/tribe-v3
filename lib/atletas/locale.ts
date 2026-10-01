/**
 * The Intl locale for the UI language, for dates and money on /atletas/.
 * A map rather than a `language === 'es'` ternary: copy lives in
 * messages/*.json (useTranslations), and the locale is the only other thing
 * that varies by language here.
 */
const INTL_LOCALE: Record<string, string> = { es: 'es-CO', en: 'en-US' };

export function intlLocale(language: string): string {
  return INTL_LOCALE[language] ?? 'es-CO';
}
