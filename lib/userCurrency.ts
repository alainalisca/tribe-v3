/**
 * User-side currency preference.
 *
 * Sessions are posted by instructors in their chosen currency (COP or USD)
 * — that part of the data model doesn't change. What changes is how a
 * single user sees prices in their feed: a Spanish-speaking Medellín user
 * sees Colombian pesos by default, an English-speaking user sees dollars.
 * If a session was posted in the OTHER currency, we still show the
 * original price first (instructors quote what they want to charge) and
 * append an approximate conversion in the user's preferred currency.
 *
 * Persistence: localStorage. Cross-device sync via a `users.preferred_currency`
 * column is a follow-up if we end up needing it. For relaunch this is fine.
 */

import type { Currency } from '@/lib/payments/config';
import { formatPrice } from '@/lib/formatCurrency';

const STORAGE_KEY = 'tribe.preferred_currency';
const CHANGE_EVENT = 'tribe:currency-change';

/**
 * Static FX rate. Real spot rate hovers ~3,800–4,200 COP/USD. Using 4,000
 * keeps the math obvious and the parenthetical conversion roughly correct
 * (the "~" prefix already signals it's an approximation). Refresh from a
 * real source if/when we add server-side billing in mixed currencies.
 */
const COP_PER_USD = 4000;

export function convertCents(amountCents: number, from: Currency, to: Currency): number {
  if (from === to) return amountCents;
  const amount = amountCents / 100;
  if (from === 'USD' && to === 'COP') {
    return Math.round(amount * COP_PER_USD * 100);
  }
  if (from === 'COP' && to === 'USD') {
    return Math.round((amount / COP_PER_USD) * 100);
  }
  return amountCents;
}

/**
 * Detect a sensible default currency for a first-time visitor.
 *
 * Browser language → currency:
 *   - Anything starting with "es-" (and `es` itself)  → COP
 *   - Anything else                                   → USD
 *
 * IP-geolocation isn't wired here — adding a server-side header lookup is
 * a separate task. Browser locale is the cheap signal we have today and
 * matches user expectations on the Medellín-first launch.
 */
export function detectInitialCurrency(): Currency {
  if (typeof navigator === 'undefined') return 'COP';
  const langs: string[] = [
    ...((navigator.languages as readonly string[] | undefined) ?? []),
    navigator.language,
  ].filter(Boolean) as string[];
  if (langs.some((l) => l.toLowerCase().startsWith('es'))) return 'COP';
  return 'USD';
}

export function getStoredCurrency(): Currency | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'USD' || v === 'COP') return v;
    return null;
  } catch {
    return null;
  }
}

export function setStoredCurrency(currency: Currency): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, currency);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: currency }));
  } catch {
    /* no-op — incognito or quota issues; the in-memory value still updates */
  }
}

export const CURRENCY_CHANGE_EVENT = CHANGE_EVENT;

/**
 * Format a session price for display.
 *
 *   - Same currency:  "$100,000"
 *   - Cross-currency: "$100,000 COP (~$25 USD)"  /  "$25 USD (~$100,000 COP)"
 *
 * The original price is always primary; the user-preferred currency is the
 * parenthetical hint. We never hide the original — instructors quote what
 * they actually want to be paid, and a buyer needs to see that.
 */
export function formatPriceForUser(amountCents: number, sessionCurrency: Currency, userCurrency: Currency): string {
  const primary = `${formatPrice(amountCents, sessionCurrency)} ${sessionCurrency}`;
  if (sessionCurrency === userCurrency) return primary;
  const converted = convertCents(amountCents, sessionCurrency, userCurrency);
  return `${primary} (~${formatPrice(converted, userCurrency)} ${userCurrency})`;
}
