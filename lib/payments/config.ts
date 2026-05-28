/**
 * Payment Gateway Configuration
 * Handles routing between Wompi (Colombia - COP) and Stripe (US - USD)
 */

export const PLATFORM_FEE_PERCENT = 15;

export type PaymentGateway = 'wompi' | 'stripe';
export type Currency = 'COP' | 'USD';
export type PaymentStatus = 'pending' | 'processing' | 'approved' | 'declined' | 'voided' | 'error';

/**
 * Select payment gateway based on currency.
 *
 * Default routing:
 *   COP (Colombian Peso) → Wompi
 *   USD (US Dollar)      → Stripe
 *
 * Override: set the `PAYMENT_GATEWAY_OVERRIDE` env var to force a single
 * gateway for all payments regardless of currency. This exists because
 * Wompi requires a Colombian legal entity + bank, which we don't have
 * yet — until we sort that out, set `PAYMENT_GATEWAY_OVERRIDE=stripe`
 * on Vercel and COP charges will route through Stripe in COP. See
 * `docs/PAYMENTS_HANDOFF.md` for the full story.
 *
 * Unset the env var to restore the per-currency default.
 */
export function getPaymentGateway(currency: Currency): PaymentGateway {
  const override = process.env.PAYMENT_GATEWAY_OVERRIDE?.toLowerCase();
  if (override === 'stripe' || override === 'wompi') {
    return override as PaymentGateway;
  }

  switch (currency) {
    case 'COP':
      return 'wompi';
    case 'USD':
      return 'stripe';
    default:
      throw new Error(`Unsupported currency: ${currency}`);
  }
}

/**
 * Calculate platform fee and instructor payout
 * @param amountCents - Amount in cents
 * @param feePercent - Fee percentage (defaults to PLATFORM_FEE_PERCENT)
 * @returns { platformFeeCents, instructorPayoutCents }
 */
export function calculateFees(amountCents: number, feePercent: number = PLATFORM_FEE_PERCENT) {
  const platformFeeCents = Math.round((amountCents * feePercent) / 100);
  const instructorPayoutCents = amountCents - platformFeeCents;

  return {
    platformFeeCents,
    instructorPayoutCents,
  };
}

/**
 * Validate currency is supported
 */
export function isSupportedCurrency(currency: string): currency is Currency {
  return currency === 'COP' || currency === 'USD';
}

/**
 * Calculate fees for a specific user, applying Tribe+ discounts if active.
 * Callers should prefer this over the bare calculateFees() at payment-creation
 * time so fee waivers flow through automatically.
 */
export function calculateFeesForUser(
  amountCents: number,
  user: { subscription_tier?: string | null; subscription_expires_at?: string | null } | null | undefined,
  feePercent: number = PLATFORM_FEE_PERCENT
) {
  // Inline check to avoid a circular import with lib/subscription/config.
  const active =
    !!user &&
    (user.subscription_tier === 'plus' || user.subscription_tier === 'pro') &&
    (!user.subscription_expires_at || new Date(user.subscription_expires_at) > new Date());
  const effectivePercent = active ? 0 : feePercent;
  return calculateFees(amountCents, effectivePercent);
}
