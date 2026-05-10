/**
 * Money + date formatting helpers shared across /os/* pages.
 *
 * Currency: USD shown with two decimals (`$1.50`), COP shown with no
 * decimals (`$1.500`) to match local expectations. Locale switches the
 * thousands/decimal separator and currency symbol position.
 */

export type Currency = 'USD' | 'COP';
export type FormatLanguage = 'en' | 'es';

const localeFor: Record<FormatLanguage, string> = {
  en: 'en-US',
  es: 'es-CO',
};

/** Format minor units (cents) as a localized currency string. */
export function formatCents(cents: number, currency: Currency, language: FormatLanguage): string {
  const decimals = currency === 'COP' ? 0 : 2;
  return new Intl.NumberFormat(localeFor[language], {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / 100);
}

/**
 * Render combined paid totals: when both currencies are non-zero, show
 * each on its own; when only one is non-zero, show that one; when both
 * are zero, return null (caller decides the empty-state copy).
 */
export function formatPaidTotal(centsUsd: number, centsCop: number, language: FormatLanguage): string | null {
  const parts: string[] = [];
  if (centsUsd > 0) parts.push(formatCents(centsUsd, 'USD', language));
  if (centsCop > 0) parts.push(formatCents(centsCop, 'COP', language));
  if (parts.length === 0) return null;
  return parts.join(' • ');
}

/** Format an ISO date string as a localized short date (e.g. "May 10, 2026" / "10 may 2026"). */
export function formatShortDate(iso: string, language: FormatLanguage): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(localeFor[language], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
