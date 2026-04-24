import { z } from 'zod';

/**
 * Validation schema for POST /api/payment/create
 *
 * Three client call-sites hit this endpoint, each with a slightly different
 * shape:
 *
 *   1. Session participation (app/session/[id]/ActionButtons.tsx):
 *      `{ session_id }` — nothing else; `payment_type` is implicit.
 *
 *   2. Boost campaign purchase (app/promote/boosts/page.tsx):
 *      `{ amount_cents, currency, payment_type: 'boost_campaign',
 *         reference_id, success_url, cancel_url }`.
 *
 *   3. Storefront session (components/storefront/StorefrontSessionCard.tsx):
 *      `{ session_id }` — same as (1).
 *
 * The schema is intentionally permissive (all fields optional) because each
 * caller sends a subset. The route handler enforces semantic validity after
 * parse (e.g. session_id must exist when payment_type resolves to 'session'
 * / 'session_participation').
 *
 * The enum includes both 'session' (short form) and 'session_participation'
 * (legacy long form, what the route defaults to when payment_type is absent)
 * so we stay backward-compatible with existing code paths without forcing a
 * migration.
 */
export const createPaymentSchema = z.object({
  // Payment kind. Optional because session clients rely on the route's
  // default ('session_participation' when absent).
  payment_type: z.enum(['session', 'session_participation', 'boost_campaign', 'pro_storefront']).optional(),

  // Session participation flow.
  session_id: z.string().uuid().optional(),
  promo_code: z.string().max(50).optional(),

  // Boost campaign / pro storefront flow.
  reference_id: z.string().uuid().optional(),
  amount_cents: z.number().int().positive().optional(),
  currency: z.enum(['COP', 'USD']).optional(),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),

  // Legacy alias some callers may still use; tolerated but unused.
  redirect_url: z.string().url().optional(),
  boost_campaign_id: z.string().uuid().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
