/**
 * Stripe Payment Gateway Integration
 * Handles US dollar (USD) payments via Stripe
 * Uses Stripe Connect for instructor payouts
 */

import { logError } from '@/lib/logger';
import { PaymentStatus } from './config';
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
}

/**
 * Create Stripe Checkout session for payment
 * Includes 10% platform fee as application_fee_amount
 */
export async function createStripeCheckoutSession(
  params: CreateStripeCheckoutSessionParams
): Promise<{ sessionId: string; url: string | null } | null> {
  try {
    const stripe = getStripeInstance();

    // Calculate application fee (platform fee)
    const platformFeeCents = Math.round((params.amountCents * 10) / 100); // 10% fee

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: `Tribe Session Participation Fee`,
              description: `Payment for session ${params.sessionId}`,
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
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        metadata: {
          tribe_session_id: params.sessionId,
          tribe_participant_user_id: params.participantUserId,
          payment_type: 'session_participation_fee',
        },
      },
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
