/**
 * Stripe Payment Gateway Integration
 * Handles US dollar (USD) payments via Stripe
 * Uses Stripe Connect for instructor payouts
 */

import { logError } from '@/lib/logger';
import { PaymentStatus, PLATFORM_FEE_PERCENT } from './config';
import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

/**
 * Get or create Stripe instance (lazy singleton)
 */
export function getStripeInstance(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable');
  }

  stripeInstance = new Stripe(secretKey, {
    apiVersion: '2024-06-20',
  });

  return stripeInstance;
}

interface CreateStripeCheckoutSessionParams {
  amountCents: number;
  currency: 'USD';
  customerEmail: string;
  sessionId: string; // Tribe session ID
  participantUserId: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * Stripe Connect account id of the instructor who will receive the payout.
   *
   * When provided, the Checkout Session is created as a "destination charge":
   * the funds first land on the platform account, then Stripe automatically
   * transfers the net amount (total minus application_fee_amount) to the
   * instructor's Connect account. This is the marketplace model.
   *
   * When omitted, the platform keeps 100% of the funds. That is correct for
   * boost campaign and pro storefront purchases — the "product" is sold by
   * Tribe itself, not by an instructor.
   */
  instructorStripeAccountId?: string;
  /**
   * Platform fee in cents.
   *
   * If omitted, we fall back to `amountCents * PLATFORM_FEE_PERCENT / 100` for
   * backward compatibility. Prefer passing this explicitly — the caller
   * already calculates fees via `calculateFeesForUser()` which applies
   * Tribe+ waivers, promo discounts, etc., and we want the Stripe-side fee
   * to match the DB-side fee exactly.
   */
  applicationFeeCents?: number;
  /**
   * Human-readable label for what's being sold. Defaults to a generic session
   * fee label for backward compatibility. Passing a specific label (for
   * example "Boost campaign — Weekend Yoga") improves Stripe dashboard and
   * receipt readability.
   */
  productName?: string;
  paymentType?: 'session_participation_fee' | 'boost_campaign' | 'pro_storefront';
}

/**
 * Create Stripe Checkout session for payment
 * Includes platform fee as application_fee_amount (uses PLATFORM_FEE_PERCENT from config)
 *
 * Marketplace note: when `instructorStripeAccountId` is supplied we add
 * `transfer_data.destination` so the net proceeds route to the instructor's
 * Connect account automatically. Without this param, money stays on the
 * platform account (correct for boost/pro purchases where Tribe is the
 * seller of record).
 */
export async function createStripeCheckoutSession(
  params: CreateStripeCheckoutSessionParams
): Promise<{ sessionId: string; url: string | null } | null> {
  try {
    const stripe = getStripeInstance();

    // Platform fee: prefer caller-supplied value so it matches the DB row.
    // Fall back to the flat PLATFORM_FEE_PERCENT calc only for legacy callers.
    const platformFeeCents =
      params.applicationFeeCents ?? Math.round((params.amountCents * PLATFORM_FEE_PERCENT) / 100);

    const productName = params.productName ?? 'Tribe Session Participation Fee';
    const paymentType = params.paymentType ?? 'session_participation_fee';

    // Build payment_intent_data. We always set application_fee_amount (even
    // without a destination, in which case Stripe just records it as an
    // internal fee on the PaymentIntent for reconciliation). When we do have
    // a destination account, Stripe uses the fee to split funds automatically.
    //
    // Type-note: Stripe's SDK exports SessionCreateParams under a nested
    // module path that TS 5.x+ doesn't resolve via the dot-notation reference
    // reliably, so we construct the object without an explicit annotation and
    // let the `stripe.checkout.sessions.create` argument shape pick it up.
    const paymentIntentData: {
      application_fee_amount: number;
      metadata: Record<string, string>;
      transfer_data?: { destination: string };
      on_behalf_of?: string;
    } = {
      application_fee_amount: platformFeeCents,
      metadata: {
        tribe_session_id: params.sessionId,
        tribe_participant_user_id: params.participantUserId,
        payment_type: paymentType,
      },
    };

    if (params.instructorStripeAccountId) {
      // "Destination charge" model: platform account is the merchant of record,
      // Stripe auto-transfers net funds to the instructor's Connect account.
      // `on_behalf_of` additionally attributes the charge to the instructor
      // for regulatory purposes (settlement currency, descriptor, 1099, etc.)
      // which is what a platform doing marketplace payouts should set.
      paymentIntentData.transfer_data = {
        destination: params.instructorStripeAccountId,
      };
      paymentIntentData.on_behalf_of = params.instructorStripeAccountId;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: productName,
              description: `Payment for ${params.sessionId}`,
            },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      payment_intent_data: paymentIntentData,
      metadata: {
        tribe_session_id: params.sessionId,
        tribe_participant_user_id: params.participantUserId,
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error) {
    logError(error, {
      action: 'createStripeCheckoutSession',
      sessionId: params.sessionId,
      hasDestination: !!params.instructorStripeAccountId,
    });
    return null;
  }
}

/**
 * Verify Stripe webhook signature
 * Uses stripe.webhooks.constructEvent which validates the signature
 */
export function verifyStripeWebhookSignature(body: string, signature: string): Stripe.Event | null {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logError(new Error('Missing STRIPE_WEBHOOK_SECRET'), {
        action: 'verifyStripeWebhookSignature',
      });
      return null;
    }

    const stripe = getStripeInstance();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    return event;
  } catch (error) {
    logError(error, { action: 'verifyStripeWebhookSignature' });
    return null;
  }
}

/**
 * Create a Stripe Connect account for an instructor
 * Used during instructor onboarding to receive payouts
 */
export async function createStripeConnectAccount(
  email: string,
  country: string = 'US'
): Promise<{ accountId: string } | null> {
  try {
    const stripe = getStripeInstance();

    const account = await stripe.accounts.create({
      type: 'express',
      country,
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        tribe_onboarding: 'true',
      },
    });

    return {
      accountId: account.id,
    };
  } catch (error) {
    logError(error, {
      action: 'createStripeConnectAccount',
      email,
    });
    return null;
  }
}

/**
 * Create a hosted onboarding link for a Connect Express account.
 *
 * This is the missing piece that was blocking instructor onboarding. Flow:
 *   1. We call stripe.accountLinks.create({ account, refresh_url, return_url,
 *      type: 'account_onboarding' }).
 *   2. Stripe returns a one-time URL, valid for a few minutes.
 *   3. We redirect the instructor to that URL. They complete ID verification
 *      and enter bank details on Stripe's hosted flow.
 *   4. On success, Stripe redirects back to `returnUrl`. On expired/abandoned
 *      links, Stripe redirects back to `refreshUrl` where we generate a new
 *      link and send them through again.
 *   5. Stripe fires 'account.updated' with charges_enabled + payouts_enabled
 *      flags. Our webhook uses that to flip users.stripe_onboarding_complete.
 *
 * Security note: the returned URL is single-use and short-lived. Never log it
 * or persist it — always generate a fresh one at click-time.
 */
export async function createStripeConnectOnboardingLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ url: string; expiresAt: number } | null> {
  try {
    const stripe = getStripeInstance();

    const link = await stripe.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: 'account_onboarding',
      // 'currently_due' (the default) only asks for info Stripe needs right
      // now. 'eventually_due' asks for everything up-front — less friction
      // during launch, more friction later. Start with the default.
    });

    return {
      url: link.url,
      expiresAt: link.expires_at,
    };
  } catch (error) {
    logError(error, {
      action: 'createStripeConnectOnboardingLink',
      accountId: params.accountId,
    });
    return null;
  }
}

/**
 * Retrieve a Connect account's current capability status.
 *
 * Useful for the return-URL handler: after Stripe redirects the instructor
 * back to our app, we can confirm with Stripe (rather than trusting the
 * redirect) whether onboarding is actually complete.
 *
 * Returns the raw Stripe.Account object so callers can inspect whatever they
 * need (requirements, capabilities, etc.). For the simple "is this account
 * ready to accept payments?" check, see `isStripeAccountReady()` below.
 */
export async function getStripeConnectAccount(accountId: string): Promise<Stripe.Account | null> {
  try {
    const stripe = getStripeInstance();
    return await stripe.accounts.retrieve(accountId);
  } catch (error) {
    logError(error, {
      action: 'getStripeConnectAccount',
      accountId,
    });
    return null;
  }
}

/**
 * Narrow check: is this Connect account ready to accept payments AND receive
 * payouts? Both must be true before we create Checkout Sessions with
 * transfer_data pointing here.
 *
 * We check BOTH flags because `charges_enabled` alone means the account can
 * be *charged* but not necessarily paid out to — routing funds there would
 * get them stuck. Requiring both avoids that trap.
 */
export function isStripeAccountReady(account: Stripe.Account): boolean {
  return !!account.charges_enabled && !!account.payouts_enabled;
}

/**
 * Create a login link for instructor Stripe Connect onboarding
 */
export async function createStripeConnectLoginLink(accountId: string): Promise<{ url: string } | null> {
  try {
    const stripe = getStripeInstance();

    const link = await stripe.accounts.createLoginLink(accountId);

    return {
      url: link.url,
    };
  } catch (error) {
    logError(error, {
      action: 'createStripeConnectLoginLink',
      accountId,
    });
    return null;
  }
}

/**
 * Map Stripe payment status to PaymentStatus
 */
export function mapStripeStatus(paymentIntentStatus: string): PaymentStatus {
  switch (paymentIntentStatus) {
    case 'succeeded':
      return 'approved';
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':
      return 'processing';
    case 'requires_capture':
      return 'pending';
    case 'canceled':
      return 'declined';
    default:
      return 'error';
  }
}

/**
 * Creates a refund for a Stripe payment intent.
 */
export async function createStripeRefund(paymentIntentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const stripe = getStripeInstance();
    await stripe.refunds.create({ payment_intent: paymentIntentId });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Stripe refund error';
    logError(error, { action: 'createStripeRefund', paymentIntentId });
    return { success: false, error: message };
  }
}

/**
 * Get payment intent details
 */
export async function getStripePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
  try {
    const stripe = getStripeInstance();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    logError(error, {
      action: 'getStripePaymentIntent',
      paymentIntentId,
    });
    return null;
  }
}

// ------------------------------------------------------------------
// Tribe.OS subscription billing
// ------------------------------------------------------------------
//
// Distinct from Stripe Connect (above): Connect handles the platform
// charging participants on behalf of instructors. This section handles
// the platform charging instructors directly for the Tribe.OS premium
// tier (currently $30/mo USD via the price referenced by env var
// STRIPE_TRIBE_OS_PRICE_ID).
//
// The two flows coexist on the same Stripe account; events for both
// arrive at the same webhook endpoint. Subscription events are routed
// by event.type to the Tribe.OS subscription handlers; payment_intent
// events stay on the Connect path.

interface CreateTribeOSCustomerParams {
  email: string;
  /** Tribe user id; written to customer metadata for traceability. */
  userId: string;
  name?: string | null;
}

/**
 * Create a Stripe customer for the Tribe.OS subscription flow. Caller
 * is responsible for persisting the returned customer id on the user
 * row (`tribe_os_stripe_customer_id`) — this function intentionally
 * doesn't touch the database so the Stripe lib stays a pure SDK
 * wrapper.
 */
export async function createTribeOSStripeCustomer(
  params: CreateTribeOSCustomerParams
): Promise<{ success: true; customerId: string } | { success: false; error: string }> {
  try {
    const stripe = getStripeInstance();
    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name ?? undefined,
      metadata: {
        tribe_user_id: params.userId,
        tribe_purpose: 'tribe_os_subscription',
      },
    });
    return { success: true, customerId: customer.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Stripe customer error';
    logError(error, { action: 'createTribeOSStripeCustomer', userId: params.userId });
    return { success: false, error: message };
  }
}

interface CreateTribeOSCheckoutSessionParams {
  customerId: string;
  /** Where Stripe redirects on successful checkout (use absolute URL). */
  successUrl: string;
  /** Where Stripe redirects if the user cancels (use absolute URL). */
  cancelUrl: string;
  /** Tribe user id, written to subscription metadata for traceability. */
  userId: string;
}

/**
 * Create a Stripe Checkout Session in `subscription` mode for the
 * Tribe.OS premium tier. The price comes from STRIPE_TRIBE_OS_PRICE_ID
 * (must be a recurring price, monthly USD per current product).
 *
 * Returns the URL the client should redirect to. The actual subscription
 * is not active until the user completes payment and Stripe fires
 * `customer.subscription.created` (which the webhook handler picks up
 * and syncs into our `tribe_os_*` columns).
 */
export async function createTribeOSCheckoutSession(
  params: CreateTribeOSCheckoutSessionParams
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const priceId = process.env.STRIPE_TRIBE_OS_PRICE_ID;
  if (!priceId) {
    return { success: false, error: 'STRIPE_TRIBE_OS_PRICE_ID is not configured' };
  }
  try {
    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // Write the tribe user id onto the subscription so we can
      // sanity-check it in the webhook handler if needed.
      subscription_data: {
        metadata: {
          tribe_user_id: params.userId,
          tribe_purpose: 'tribe_os_subscription',
        },
      },
      // Allow customer to apply promo codes from Stripe Dashboard.
      allow_promotion_codes: true,
    });
    if (!session.url) {
      return { success: false, error: 'Stripe did not return a checkout URL' };
    }
    return { success: true, url: session.url };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Stripe checkout error';
    logError(error, { action: 'createTribeOSCheckoutSession', userId: params.userId });
    return { success: false, error: message };
  }
}

interface CreateCustomerPortalSessionParams {
  customerId: string;
  returnUrl: string;
}

/**
 * Create a Stripe Customer Portal session so the user can manage their
 * subscription (cancel, update payment method, view invoices) without
 * leaving the app. Returns the portal URL for client redirect.
 */
export async function createTribeOSCustomerPortalSession(
  params: CreateCustomerPortalSessionParams
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const stripe = getStripeInstance();
    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    if (!session.url) {
      return { success: false, error: 'Stripe did not return a portal URL' };
    }
    return { success: true, url: session.url };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Stripe portal error';
    logError(error, { action: 'createTribeOSCustomerPortalSession', customerId: params.customerId });
    return { success: false, error: message };
  }
}
