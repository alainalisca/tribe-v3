/**
 * Payment Gateway Configuration
 * Handles routing between Wompi (Colombia - COP) and Stripe (US - USD)
 */

export const PLATFORM_FEE_PERCENT = 15;

export type PaymentGateway = 'wompi' | 'stripe';
export type Currency = 'COP' | 'USD';
export type PaymentStatus = 'pending' | 'processing' | 'approved' | 'declined' | 'voided' | 'error';

/**
 * Select payment gateway based on currency
 * COP (Colombian Peso) → Wompi
 * USD (US Dollar) → Stripe
 */
export function getPaymentGateway(currency: Currency): PaymentGateway {
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
