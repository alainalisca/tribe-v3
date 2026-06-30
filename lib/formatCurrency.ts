import { Currency } from '@/lib/payments/config';

/**
 * Format price from cents to display string.
 *
 * Always uses Intl.NumberFormat with currencyDisplay:'code' so the ISO
 * currency code (e.g. "COP", "USD") is emitted literally by the formatter —
 * never via a locale-sensitive name lookup that can produce unexpected words
 * (e.g. some ICU/browser environments for es-CO with currencyDisplay:'name'
 * have returned incorrect strings for "COP").
 *
 * COP: COP 150.000  (no decimals, Colombian thousands separator)
 * USD: USD 35.00    (2 decimals)
 *
 * The locale is always es-CO for COP (Colombian thousands/decimal convention)
 * and en-US for USD, regardless of the user's UI language, because the
 * separator style is a property of the currency's home locale, not the UI.
 */
export function formatPrice(cents: number, currency: Currency): string {
  const amount = cents / 100;
  if (currency === 'COP') {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      currencyDisplay: 'code',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a raw display amount (not cents) for form inputs.
 * Same rules as formatPrice but takes the already-divided amount.
 */
export function formatDisplayAmount(amount: number, currency: Currency): string {
  if (currency === 'COP') {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      currencyDisplay: 'code',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
