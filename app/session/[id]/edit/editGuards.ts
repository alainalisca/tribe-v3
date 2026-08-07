/** Pure guard and pricing helpers for the session edit flow (T-EDIT-01). */

export interface EditLockSession {
  date: string;
  start_time: string;
  is_recurring: boolean | null;
}

/**
 * Past sessions are historical records and read only. Recurring parents are
 * exempt: their own date is in the past by design while the cron keeps
 * generating future occurrences from them, and editing the parent is the only
 * way to change what future occurrences inherit.
 */
export function isEditLocked(session: EditLockSession, now: Date): boolean {
  if (session.is_recurring) return false;
  return new Date(`${session.date}T${session.start_time}`).getTime() < now.getTime();
}

export interface PriceSnapshot {
  is_paid: boolean | null;
  price_cents: number | null;
}

/**
 * A free-to-paid change on a session people already joined must not happen
 * silently (spec section 7.5). "Free" matches the feed card's display rule:
 * falsy price_cents, regardless of is_paid.
 */
export function needsPriceChangeConfirmation(
  original: PriceSnapshot,
  nextIsPaid: boolean,
  confirmedCount: number
): boolean {
  const wasFree = !original.price_cents;
  return wasFree && nextIsPaid && confirmedCount > 0;
}

export interface PriceFormInput {
  is_paid: boolean;
  price_display: string;
  currency: 'COP' | 'USD';
  payment_instructions: string;
}

export type PriceFields =
  | { is_paid: true; price_cents: number; currency: 'COP' | 'USD'; payment_instructions: string }
  | { is_paid: false; price_cents: null };

/**
 * Free must write price_cents: null explicitly — the DB constraint allows a
 * stale price to survive is_paid=false, and the feed card shows any non-null
 * price as paid.
 */
export function buildPriceFields(input: PriceFormInput): PriceFields {
  if (!input.is_paid) return { is_paid: false, price_cents: null };
  return {
    is_paid: true,
    price_cents: Math.round(parseFloat(input.price_display) * 100),
    currency: input.currency,
    payment_instructions: input.payment_instructions,
  };
}

export type PriceValidationError = 'price_required' | 'min_usd' | 'min_cop' | 'instructions_required';

// Same floors as the create page: USD $5 / COP 20,000 (~$5).
export const MIN_PRICE_USD = 5;
export const MIN_PRICE_COP = 20000;

export function validatePriceInput(input: PriceFormInput): PriceValidationError | null {
  if (!input.is_paid) return null;
  const price = parseFloat(input.price_display);
  if (!input.price_display || isNaN(price) || price <= 0) return 'price_required';
  if (input.currency === 'USD' && price < MIN_PRICE_USD) return 'min_usd';
  if (input.currency === 'COP' && price < MIN_PRICE_COP) return 'min_cop';
  if (!input.payment_instructions.trim()) return 'instructions_required';
  return null;
}
