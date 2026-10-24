/**
 * T-PLAN1: Stripe calls for coach plans (Stripe Billing, subscription mode).
 *
 * Same Stripe account and singleton as everything else (lib/payments/stripe.ts),
 * but its own customers: a coach-plan customer is never the Tribe.OS customer,
 * because the Tribe.OS webhook handlers find their user by
 * tribe_os_stripe_customer_id alone (Step 0 report, 2026-10-12).
 *
 * Every object created here is tagged tribe_purpose: 'coach_plan', which is how
 * the webhook tells these events apart from Tribe.OS and session payments.
 * Pure SDK wrappers: nothing here touches the database.
 */

import { logError } from '@/lib/logger';
import { getStripeInstance } from './stripe';
import type { PaidCoachPlan } from '@/lib/subscription/coachPlans';

export const COACH_PLAN_PURPOSE = 'coach_plan';

type StripeResult<T> = ({ success: true } & T) | { success: false; error: string };

export async function createCoachPlanCustomer(params: {
  email: string;
  userId: string;
  name?: string | null;
}): Promise<StripeResult<{ customerId: string }>> {
  try {
    const customer = await getStripeInstance().customers.create({
      email: params.email,
      name: params.name ?? undefined,
      metadata: { tribe_user_id: params.userId, tribe_purpose: COACH_PLAN_PURPOSE },
    });
    return { success: true, customerId: customer.id };
  } catch (error: unknown) {
    logError(error, { action: 'createCoachPlanCustomer', userId: params.userId });
    return { success: false, error: error instanceof Error ? error.message : 'stripe_customer_failed' };
  }
}

export async function createCoachPlanCheckoutSession(params: {
  customerId: string;
  priceId: string;
  plan: PaidCoachPlan;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeResult<{ url: string }>> {
  const metadata = { tribe_user_id: params.userId, tribe_purpose: COACH_PLAN_PURPOSE, coach_plan: params.plan };
  try {
    const session = await getStripeInstance().checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // On the session AND the subscription: checkout.session.completed reads
      // the first, customer.subscription.* and invoices read the second.
      metadata,
      subscription_data: { metadata },
      client_reference_id: params.userId,
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
      // Card Checkout asks for the cardholder name, which is the billing name.
    });
    if (!session.url) return { success: false, error: 'no_checkout_url' };
    return { success: true, url: session.url };
  } catch (error: unknown) {
    logError(error, { action: 'createCoachPlanCheckoutSession', userId: params.userId, plan: params.plan });
    return { success: false, error: error instanceof Error ? error.message : 'stripe_checkout_failed' };
  }
}

/** The Customer Portal: coaches update their card and cancel on their own. */
export async function createCoachPlanPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<StripeResult<{ url: string }>> {
  try {
    const session = await getStripeInstance().billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    if (!session.url) return { success: false, error: 'no_portal_url' };
    return { success: true, url: session.url };
  } catch (error: unknown) {
    logError(error, { action: 'createCoachPlanPortalSession', customerId: params.customerId });
    return { success: false, error: error instanceof Error ? error.message : 'stripe_portal_failed' };
  }
}

/**
 * Account deletion (lib/account/deleteAccount, step cancel_plan): end a coach's
 * plan in Stripe NOW, not at the period end. prorate: false and invoice_now:
 * false, so Stripe issues no credit, no final invoice and nothing after.
 *
 * Safe to run again, as every deletion step must be: a subscription that is
 * already canceled (or expired before it started, or not in this Stripe
 * account at all) has nothing left to bill, so it counts as done
 * (alreadyGone). Any other refusal is returned as an error and the deletion
 * stops before anything of theirs is touched.
 */
export async function cancelCoachPlanSubscriptionNow(
  subscriptionId: string
): Promise<StripeResult<{ alreadyGone: boolean }>> {
  try {
    const stripe = getStripeInstance();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (sub.status === 'canceled' || sub.status === 'incomplete_expired') return { success: true, alreadyGone: true };
    await stripe.subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false });
    return { success: true, alreadyGone: false };
  } catch (error: unknown) {
    if (isRecord(error) && error.code === 'resource_missing') return { success: true, alreadyGone: true };
    logError(error, { action: 'cancelCoachPlanSubscriptionNow', subscriptionId });
    return { success: false, error: error instanceof Error ? error.message : 'stripe_cancel_failed' };
  }
}

/** The subscription fields the webhook needs, whatever API version shaped the payload. */
export interface CoachPlanSubscription {
  id: string;
  customer: string;
  status: string;
  metadata: Record<string, string>;
  priceId: string | null;
  /** ISO timestamp, or null when Stripe did not send one. */
  currentPeriodEnd: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  return out;
}

/**
 * Normalise a Stripe Subscription object. current_period_end sits on the
 * subscription in API 2024-06-20 (this SDK's pinned version) and on each item
 * from 2025-03-31 on; the webhook endpoint's own version decides which arrives,
 * so both are read.
 */
export function readCoachPlanSubscription(raw: unknown): CoachPlanSubscription | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const customer = typeof raw.customer === 'string' ? raw.customer : isRecord(raw.customer) ? raw.customer.id : null;
  if (typeof customer !== 'string' || typeof raw.status !== 'string') return null;
  const items = isRecord(raw.items) && Array.isArray(raw.items.data) ? raw.items.data : [];
  const first: unknown = items[0];
  const price = isRecord(first) && isRecord(first.price) && typeof first.price.id === 'string' ? first.price.id : null;
  const itemEnd = isRecord(first) && typeof first.current_period_end === 'number' ? first.current_period_end : null;
  const subEnd = typeof raw.current_period_end === 'number' ? raw.current_period_end : null;
  const end = subEnd ?? itemEnd;
  return {
    id: raw.id,
    customer,
    status: raw.status,
    metadata: stringRecord(raw.metadata),
    priceId: price,
    currentPeriodEnd: end === null ? null : new Date(end * 1000).toISOString(),
  };
}

export async function retrieveCoachPlanSubscription(subscriptionId: string): Promise<CoachPlanSubscription | null> {
  try {
    const sub: unknown = await getStripeInstance().subscriptions.retrieve(subscriptionId);
    return readCoachPlanSubscription(sub);
  } catch (error: unknown) {
    logError(error, { action: 'retrieveCoachPlanSubscription', subscriptionId });
    return null;
  }
}
