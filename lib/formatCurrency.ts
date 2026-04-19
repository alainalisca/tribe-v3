import { Currency } from '@/lib/payments/config';

/**
 * Format price from cents to display string
 * COP: $150,000 (thousand separators, no decimals)
 * USD: $35.00 (2 decimals)
 */
export function formatPrice(cents: number, currency: Currency): string {
  const amount = cents / 100;
  if (currency === 'COP') {
    return `$${amount.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }
  return `$${amount.toFixed(2)}`;
}

/**
 * Format a raw display amount (not cents) for form inputs
 */
export function formatDisplayAmount(amount: number, currency: Currency): string {
  if (currency === 'COP') {
    return `$${amount.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`;
  }
  return `$${amount.toFixed(2)}`;
}
