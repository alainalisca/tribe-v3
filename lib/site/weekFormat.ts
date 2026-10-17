/** T-SITE1 Part B. Display helpers for the week board, shared with its tests. */
export const DAYS = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
} as const;

/** Weekday of a YYYY-MM-DD calendar date, independent of the viewer's timezone. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * "30.000": the amount alone, Colombian grouping, no currency sign or space
 * (T-SITE1.1), in both languages; the board only lists peso prices.
 */
export function formatPrice(price: { cents: number; currency: string }, _lang: 'es' | 'en'): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(price.cents / 100);
}
