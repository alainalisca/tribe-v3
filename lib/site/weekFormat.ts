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

export function formatPrice(price: { cents: number; currency: string }, lang: 'es' | 'en'): string {
  return new Intl.NumberFormat(lang === 'es' ? 'es-CO' : 'en-US', {
    style: 'currency',
    currency: price.currency,
    maximumFractionDigits: 0,
  }).format(price.cents / 100);
}
