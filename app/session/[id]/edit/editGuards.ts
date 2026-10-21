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

export interface SeriesMembership {
  recurring_parent_id: string | null;
}

/**
 * True when the session is one occurrence OF a recurring series, i.e. it points
 * at a parent. A child is never independently recurring, so the edit form hides
 * the recurrence toggle for it and the submit path forces the non-recurring
 * shape. A true parent (recurring_parent_id null) and a plain one-off both
 * return false — only rows with a parent link are children.
 */
export function isSeriesChild(session: SeriesMembership): boolean {
  return session.recurring_parent_id != null;
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

// The price rules moved to the shared session-form rules (T-POLISH1 PR 4) so
// /create and this page read one copy; re-exported for the existing callers.
import type { PriceFormInput } from '@/lib/sessions/sessionFormRules';
export {
  validatePriceInput,
  MIN_PRICE_USD,
  MIN_PRICE_COP,
  type PriceFormInput,
  type PriceValidationError,
} from '@/lib/sessions/sessionFormRules';

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
