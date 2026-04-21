/**
 * POST /api/payment/create
 * Create a payment session for:
 *   1. Session participation (payment_type: 'session_participation' or legacy session_id param)
 *   2. Boost campaign purchase (payment_type: 'boost_campaign')
 *   3. Pro storefront upgrade (payment_type: 'pro_storefront')
 *
 * Routes to Wompi (COP) or Stripe (USD) based on currency.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { createPaymentSchema } from '@/lib/validations/payment';
import {
  getPaymentGateway,
  isSupportedCurrency,
  calculateFees,
  calculateFeesForUser,
  PLATFORM_FEE_PERCENT,
} from '@/lib/payments/config';
import { createWompiTransaction } from '@/lib/payments/wompi';
import { createStripeCheckoutSession } from '@/lib/payments/stripe';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user first, then rate-limit by user id (falling back
    // to IP if unauthenticated — though we still reject unauth below).
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: max 10 payment creation attempts per minute per user.
    const { allowed } = await checkRateLimit(supabase, `payment-create:${user.id}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();

    // Validate input with Zod
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const paymentType = body.payment_type || 'session_participation';

    // ──── BOOST CAMPAIGN / PRO STOREFRONT PAYMENTS ────
    if (paymentType === 'boost_campaign' || paymentType === 'pro_storefront') {
      const { currency, reference_id, success_url, cancel_url } = body;

      if (!currency || !reference_id) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: currency, reference_id' },
          { status: 400 }
        );
      }

      if (!isSupportedCurrency(currency)) {
        return NextResponse.json({ success: false, error: `Unsupported currency: ${currency}` }, { status: 400 });
      }

      const gateway = getPaymentGateway(currency as 'COP' | 'USD');
      const userEmail = user.email || '';
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

      const serviceSupabase = createServiceClient(supabaseUrl, serviceRoleKey);

      // Server-side price validation: never trust client-submitted amount_cents
      let validatedAmountCents: number;
      if (paymentType === 'boost_campaign') {
        const { data: campaign, error: campaignError } = await serviceSupabase
          .from('boost_campaigns')
          .select('total_budget_cents')
          .eq('id', reference_id)
          .eq('instructor_id', user.id)
          .single();
        if (campaignError || !campaign) {
          return NextResponse.json(
            { success: false, error: 'Boost campaign not found or not owned by you' },
            { status: 404 }
          );
        }
        validatedAmountCents = campaign.total_budget_cents;
      } else {
        // pro_storefront: use fixed known price tiers
        const PRO_STOREFRONT_PRICE_CENTS: Record<string, number> = {
          COP: 9900000, // ~$99,000 COP
          USD: 2999, // $29.99 USD
        };
        validatedAmountCents = PRO_STOREFRONT_PRICE_CENTS[currency] || 2999;
      }
      const amount_cents = validatedAmountCents;

      // Create payment record
      const { data: paymentRecord, error: paymentError } = await serviceSupabase
        .from('payments')
        .insert({
          participant_user_id: user.id,
          amount_cents,
          platform_fee_cents: amount_cents, // Platform keeps 100% for boost/pro purchases
          instructor_payout_cents: 0,
          currency,
          gateway,
          status: 'pending',
          payment_type: paymentType,
          reference_id: reference_id,
        })
        .select('id')
        .single();

      if (paymentError || !paymentRecord) {
        logError(paymentError, { route: '/api/payment/create', action: 'insert_boost_payment' });
        return NextResponse.json({ success: false, error: 'Failed to create payment record' }, { status: 500 });
      }

      const paymentId = paymentRecord.id;
      let checkoutUrl: string | undefined;

      if (gateway === 'wompi') {
        const returnUrl = success_url || `${siteUrl}/promote/boosts?payment=success&campaign=${reference_id}`;
        const wompiResult = await createWompiTransaction({
          amountCents: amount_cents,
          currency: 'COP',
          customerEmail: userEmail,
          reference: paymentId,
          redirectUrl: returnUrl,
        });

        if (!wompiResult) {
          await serviceSupabase.from('payments').update({ status: 'error' }).eq('id', paymentId);
          logError(new Error('Wompi transaction creation returned null'), {
            route: '/api/payment/create',
            action: 'wompi_boost_transaction',
            paymentId,
            amountCents: amount_cents,
            hasPublicKey: !!process.env.WOMPI_PUBLIC_KEY,
            hasPrivateKey: !!process.env.WOMPI_PRIVATE_KEY,
            isSandbox: process.env.WOMPI_SANDBOX,
          });
          return NextResponse.json({ success: false, error: 'Failed to create Wompi transaction' }, { status: 500 });
        }

        checkoutUrl = wompiResult.redirect_url;
        await serviceSupabase
          .from('payments')
          .update({ gateway_payment_id: wompiResult.transaction_id, status: 'processing' })
          .eq('id', paymentId);
      } else {
        const finalSuccessUrl = success_url || `${siteUrl}/promote/boosts?payment=success&campaign=${reference_id}`;
        const finalCancelUrl = cancel_url || `${siteUrl}/promote/boosts?payment=cancelled&campaign=${reference_id}`;

        const stripeResult = await createStripeCheckoutSession({
          amountCents: amount_cents,
          currency: 'USD',
          customerEmail: userEmail,
          sessionId: reference_id, // Use reference_id as Stripe metadata
          participantUserId: user.id,
          successUrl: finalSuccessUrl,
          cancelUrl: finalCancelUrl,
        });

        if (!stripeResult?.url) {
          await serviceSupabase.from('payments').update({ status: 'error' }).eq('id', paymentId);
          return NextResponse.json({ success: false, error: 'Failed to create Stripe session' }, { status: 500 });
        }

        checkoutUrl = stripeResult.url;
        await serviceSupabase
          .from('payments')
          .update({ gateway_payment_id: stripeResult.sessionId, status: 'processing' })
          .eq('id', paymentId);
      }

      return NextResponse.json({
        success: true,
        checkout_url: checkoutUrl,
        payment_id: paymentId,
        gateway,
      });
    }

    // ──── SESSION PARTICIPATION PAYMENT (original flow) ────
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json({ success: false, error: 'Missing session_id' }, { status: 400 });
    }

    // Fetch session details — uses price_cents (the live DB column name)
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, is_paid, price_cents, currency, sport, location, creator_id, platform_fee_percent')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    if (!session.is_paid || !session.price_cents) {
      return NextResponse.json({ success: false, error: 'This is not a paid session' }, { status: 400 });
    }

    const currency = session.currency || 'COP';
    if (!isSupportedCurrency(currency)) {
      return NextResponse.json({ success: false, error: `Unsupported currency: ${currency}` }, { status: 400 });
    }

    // Check user isn't the creator
    if (session.creator_id === user.id) {
      return NextResponse.json({ success: false, error: 'Cannot pay for your own session' }, { status: 400 });
    }

    // Check for existing pending/approved payment
    const serviceSupabase = createServiceClient(supabaseUrl, serviceRoleKey);
    const { data: existingPayment } = await serviceSupabase
      .from('payments')
      .select('id, status')
      .eq('session_id', session_id)
      .eq('participant_user_id', user.id)
      .in('status', ['pending', 'processing', 'approved'])
      .maybeSingle();

    if (existingPayment?.status === 'approved') {
      return NextResponse.json({ success: false, error: 'Payment already completed' }, { status: 400 });
    }

    // Apply promo code discount if provided
    let finalAmountCents = session.price_cents;
    let discountCents = 0;
    let promoCodeId: string | null = null;

    const promoCode = body.promo_code as string | undefined;
    if (promoCode) {
      const { validatePromoCode } = await import('@/lib/dal/promote');
      const validation = await validatePromoCode(serviceSupabase, promoCode, session_id);

      if (validation.success && validation.data) {
        const promo = validation.data;
        promoCodeId = promo.id;

        if (promo.discount_type === 'percentage') {
          discountCents = Math.round(finalAmountCents * (promo.discount_value / 100));
        } else if (promo.discount_type === 'fixed') {
          discountCents = Math.min(promo.discount_value * 100, finalAmountCents);
        } else if (promo.discount_type === 'free') {
          discountCents = finalAmountCents;
        }

        finalAmountCents = Math.max(finalAmountCents - discountCents, 0);
      }
    }

    const amountCents = finalAmountCents;
    const feePercent = session.platform_fee_percent || PLATFORM_FEE_PERCENT;

    // Tribe+ members pay no platform fee. Fetch subscription state for the buyer
    // and let calculateFeesForUser apply the waiver. If the lookup fails, fall
    // back to the standard fee — never let a lookup error break payment.
    const { data: buyerProfile } = await serviceSupabase
      .from('users')
      .select('subscription_tier, subscription_expires_at')
      .eq('id', user.id)
      .maybeSingle();

    const { platformFeeCents, instructorPayoutCents } = calculateFeesForUser(
      amountCents,
      buyerProfile as { subscription_tier?: string | null; subscription_expires_at?: string | null } | null,
      feePercent
    );
    // Silences the unused-import warning while keeping calculateFees available
    // as a fallback for non-user-scoped callers.
    void calculateFees;
    const gateway = getPaymentGateway(currency as 'COP' | 'USD');
    const userEmail = user.email || '';
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // Create payment record in DB
    const { data: paymentRecord, error: paymentError } = await serviceSupabase
      .from('payments')
      .insert({
        session_id,
        participant_user_id: user.id,
        amount_cents: amountCents,
        platform_fee_cents: platformFeeCents,
        instructor_payout_cents: instructorPayoutCents,
        currency,
        gateway,
        status: 'pending',
        discount_cents: discountCents,
        promo_code_id: promoCodeId,
      })
      .select('id')
      .single();

    if (paymentError || !paymentRecord) {
      logError(paymentError, { route: '/api/payment/create', action: 'insert_payment' });
      return NextResponse.json({ success: false, error: 'Failed to create payment record' }, { status: 500 });
    }

    const paymentId = paymentRecord.id;

    // Redeem promo code if applied
    if (promoCodeId) {
      const { redeemPromoCode } = await import('@/lib/dal/promote');
      await redeemPromoCode(serviceSupabase, promoCodeId, user.id, paymentId, discountCents);
    }

    let redirectUrl: string | undefined;

    if (gateway === 'wompi') {
      const returnUrl = `${siteUrl}/payment/confirm?payment_id=${paymentId}`;
      const wompiResult = await createWompiTransaction({
        amountCents,
        currency: 'COP',
        customerEmail: userEmail,
        reference: paymentId,
        redirectUrl: returnUrl,
      });

      if (!wompiResult) {
        await serviceSupabase.from('payments').update({ status: 'error' }).eq('id', paymentId);
        logError(new Error('Wompi transaction creation returned null'), {
          route: '/api/payment/create',
          action: 'wompi_session_transaction',
          paymentId,
          sessionId: session_id,
          amountCents,
          hasPublicKey: !!process.env.WOMPI_PUBLIC_KEY,
          hasPrivateKey: !!process.env.WOMPI_PRIVATE_KEY,
          isSandbox: process.env.WOMPI_SANDBOX,
        });
        return NextResponse.json({ success: false, error: 'Failed to create Wompi transaction' }, { status: 500 });
      }

      redirectUrl = wompiResult.redirect_url;

      // Store Wompi transaction ID
      await serviceSupabase
        .from('payments')
        .update({
          gateway_payment_id: wompiResult.transaction_id,
          status: 'processing',
        })
        .eq('id', paymentId);
    } else {
      const successUrl = `${siteUrl}/payment/confirm?payment_id=${paymentId}&gateway=stripe`;
      const cancelUrl = `${siteUrl}/session/${session_id}?payment=cancelled`;

      const stripeResult = await createStripeCheckoutSession({
        amountCents,
        currency: 'USD',
        customerEmail: userEmail,
        sessionId: session_id,
        participantUserId: user.id,
        successUrl,
        cancelUrl,
      });

      if (!stripeResult?.url) {
        await serviceSupabase.from('payments').update({ status: 'error' }).eq('id', paymentId);
        return NextResponse.json({ success: false, error: 'Failed to create Stripe session' }, { status: 500 });
      }

      redirectUrl = stripeResult.url;

      // Store Stripe session ID
      await serviceSupabase
        .from('payments')
        .update({
          gateway_payment_id: stripeResult.sessionId,
          stripe_payment_intent_id: stripeResult.sessionId,
          status: 'processing',
        })
        .eq('id', paymentId);
    }

    return NextResponse.json({
      success: true,
      data: {
        gateway,
        payment_id: paymentId,
        redirect_url: redirectUrl,
      },
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/payment/create', action: 'create_payment' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
