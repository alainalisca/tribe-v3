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
import { getServiceRoleClient } from '@/lib/supabase/admin';
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
import { isCreatorPremium } from '@/lib/dal/tribeOSSubscription';
import { createTip } from '@/lib/dal/tips';

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
    // Use service-role client — `rate_limits` denies inserts for non-service roles via RLS.
    const { allowed } = await checkRateLimit(getServiceRoleClient(), `payment-create:${user.id}`, 10, 60_000);
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

    // ──── TIP PAYMENT ────
    // A gratuity from an athlete to an instructor. Unlike a session, a tip
    // has no server-side canonical price, so the amount is client-supplied
    // and clamped to per-currency bounds. 100% goes to the instructor
    // (platform_fee_cents = 0). The tip is tracked only in the `tips` table
    // (no payments row): finalize_payment (migration 088) finalizes it via a
    // tips-table fallback, and the migration-029 trigger updates the
    // instructor's cached totals on approval.
    if (paymentType === 'tip') {
      const { instructor_id, currency, amount_cents, session_id: tipSessionId, message } = body;

      if (!instructor_id || !currency || amount_cents === undefined || amount_cents === null) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: instructor_id, currency, amount_cents' },
          { status: 400 }
        );
      }

      if (!isSupportedCurrency(currency)) {
        return NextResponse.json({ success: false, error: `Unsupported currency: ${currency}` }, { status: 400 });
      }

      if (instructor_id === user.id) {
        return NextResponse.json({ success: false, error: 'Cannot tip yourself' }, { status: 400 });
      }

      // Per-currency tip bounds, expressed in the same minor-unit convention
      // the rest of the payment system (and the gateways) use: USD cents and
      // COP pesos × 100. The USD floor sits well above Stripe's 50-cent hard
      // minimum. We reject (not silently clamp) an out-of-range amount so the
      // athlete is never charged a different number than they chose.
      const TIP_BOUNDS: Record<string, { min: number; max: number }> = {
        USD: { min: 100, max: 50_000 }, // $1.00 .. $500.00
        COP: { min: 200_000, max: 200_000_000 }, // ~$2,000 .. ~$2,000,000 COP
      };
      const bounds = TIP_BOUNDS[currency];
      const tipAmount = Math.floor(Number(amount_cents));
      if (!Number.isFinite(tipAmount) || tipAmount <= 0) {
        return NextResponse.json({ success: false, error: 'Invalid tip amount' }, { status: 400 });
      }
      if (bounds && (tipAmount < bounds.min || tipAmount > bounds.max)) {
        return NextResponse.json(
          {
            success: false,
            error:
              currency === 'USD'
                ? `Tip must be between $${(bounds.min / 100).toFixed(2)} and $${(bounds.max / 100).toFixed(2)} USD`
                : `Tip must be between $${(bounds.min / 100).toLocaleString()} and $${(
                    bounds.max / 100
                  ).toLocaleString()} COP`,
          },
          { status: 400 }
        );
      }

      const gateway = getPaymentGateway(currency as 'COP' | 'USD');
      const userEmail = user.email || '';
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
      const serviceSupabase = createServiceClient(supabaseUrl, serviceRoleKey);

      // USD tips route through the instructor's Stripe Connect account as a
      // 100%-destination charge. Refuse before creating anything if their
      // onboarding isn't complete — otherwise funds would settle to the
      // platform with no way to forward them (same hazard as USD sessions).
      let instructorStripeAccountId: string | undefined;
      if (gateway === 'stripe') {
        const { data: instructorProfile } = await serviceSupabase
          .from('users')
          .select('stripe_account_id, stripe_onboarding_complete')
          .eq('id', instructor_id)
          .maybeSingle();
        if (!instructorProfile?.stripe_account_id || !instructorProfile?.stripe_onboarding_complete) {
          return NextResponse.json(
            {
              success: false,
              error: 'This instructor cannot accept USD tips yet (payout setup incomplete).',
            },
            { status: 409 }
          );
        }
        instructorStripeAccountId = instructorProfile.stripe_account_id;
      }

      const tipResult = await createTip(
        serviceSupabase,
        user.id,
        instructor_id,
        tipAmount,
        currency,
        gateway,
        typeof tipSessionId === 'string' ? tipSessionId : undefined,
        typeof message === 'string' ? message : undefined
      );
      if (!tipResult.success || !tipResult.data) {
        logError(new Error(tipResult.success ? 'createTip returned no id' : tipResult.error), {
          route: '/api/payment/create',
          action: 'create_tip',
          instructorId: instructor_id,
        });
        return NextResponse.json({ success: false, error: 'Failed to create tip' }, { status: 500 });
      }
      const tipId = tipResult.data.id;

      let redirectUrl: string | undefined;

      if (gateway === 'wompi') {
        const wompiResult = await createWompiTransaction({
          amountCents: tipAmount,
          currency: 'COP',
          customerEmail: userEmail,
          reference: tipId,
          redirectUrl: `${siteUrl}/payment/confirm?tip=${tipId}`,
        });
        if (!wompiResult) {
          await serviceSupabase.from('tips').update({ status: 'error' }).eq('id', tipId);
          logError(new Error('Wompi transaction creation returned null'), {
            route: '/api/payment/create',
            action: 'wompi_tip_transaction',
            tipId,
            amountCents: tipAmount,
          });
          return NextResponse.json({ success: false, error: 'Failed to create Wompi transaction' }, { status: 500 });
        }
        redirectUrl = wompiResult.redirect_url;
        // The gateway transaction id is the handle finalize_payment matches
        // the tip on when the webhook fires.
        await serviceSupabase.from('tips').update({ gateway_payment_id: wompiResult.transaction_id }).eq('id', tipId);
      } else {
        // PAYMENT_GATEWAY_OVERRIDE: COP can land here when the env override
        // forces Stripe. The app stores COP as `value × 100` (Wompi convention).
        // Stripe treats COP as zero-decimal, so divide by 100 when forwarding.
        const stripeAmount = currency === 'COP' ? Math.round(tipAmount / 100) : tipAmount;
        const stripeResult = await createStripeCheckoutSession({
          amountCents: stripeAmount,
          currency,
          customerEmail: userEmail,
          sessionId: tipId, // carried in Stripe metadata for traceability
          participantUserId: user.id,
          successUrl: `${siteUrl}/payment/confirm?tip=${tipId}&gateway=stripe`,
          cancelUrl: `${siteUrl}/profile/${instructor_id}?tip=cancelled`,
          instructorStripeAccountId,
          // Tips carry no platform fee — 100% to the instructor.
          applicationFeeCents: 0,
          productName: 'Tribe Tip',
          paymentType: 'tip',
        });
        if (!stripeResult?.url) {
          await serviceSupabase.from('tips').update({ status: 'error' }).eq('id', tipId);
          return NextResponse.json({ success: false, error: 'Failed to create Stripe session' }, { status: 500 });
        }
        redirectUrl = stripeResult.url;
        await serviceSupabase.from('tips').update({ gateway_payment_id: stripeResult.sessionId }).eq('id', tipId);
      }

      return NextResponse.json({
        success: true,
        data: {
          gateway,
          tip_id: tipId,
          redirect_url: redirectUrl,
        },
      });
    }

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

        // PAYMENT_GATEWAY_OVERRIDE: COP can land here when the override forces
        // Stripe. App stores COP as `value × 100`; Stripe is zero-decimal.
        const stripeAmount = currency === 'COP' ? Math.round(amount_cents / 100) : amount_cents;
        const stripeResult = await createStripeCheckoutSession({
          amountCents: stripeAmount,
          currency,
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

    // Fetch the instructor's Stripe Connect status. For USD sessions we
    // MUST have a destination account ready before creating the Checkout
    // Session — otherwise funds would land on the platform and get stuck.
    // For COP sessions (Wompi) this is unused; payouts go through the
    // manual/bank payout flow on the user profile.
    const { data: creatorProfile } = await supabase
      .from('users')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', session?.creator_id ?? '')
      .maybeSingle();

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

    // Minimum session price enforcement — defense in depth.
    // The /create UI already validates this client-side (see
    // app/create/page.tsx validate()), but a malicious instructor could POST
    // directly or edit their session's price_cents via a crafted update. Both
    // would let them bypass the platform fee via rounding, AND in the USD
    // case would hit Stripe's $0.50 hard minimum and produce a confusing
    // "Failed to create Stripe session" error for the buyer.
    //
    // Chosen floors:
    //   USD: 500 cents ($5.00)    — well above Stripe's 50-cent hard minimum
    //   COP: 2,000,000 cents (~20,000 COP) — comparable to $5 USD
    const MIN_PRICE_CENTS: Record<string, number> = {
      USD: 500,
      COP: 2000000,
    };
    const minCents = MIN_PRICE_CENTS[currency];
    if (minCents && session.price_cents < minCents) {
      return NextResponse.json(
        {
          success: false,
          error:
            currency === 'USD'
              ? `Session price must be at least $${(minCents / 100).toFixed(2)} USD`
              : `Session price must be at least ${(minCents / 100).toLocaleString()} COP`,
        },
        { status: 400 }
      );
    }

    // Check user isn't the creator
    if (session.creator_id === user.id) {
      return NextResponse.json({ success: false, error: 'Cannot pay for your own session' }, { status: 400 });
    }

    // Check for existing approved payment (real money already changed hands —
    // block a duplicate charge). We query `approved` specifically; other
    // statuses are handled below.
    const serviceSupabase = createServiceClient(supabaseUrl, serviceRoleKey);
    const { data: approvedPayment } = await serviceSupabase
      .from('payments')
      .select('id')
      .eq('session_id', session_id)
      .eq('participant_user_id', user.id)
      .eq('status', 'approved')
      .maybeSingle();

    if (approvedPayment) {
      return NextResponse.json({ success: false, error: 'Payment already completed' }, { status: 400 });
    }

    // Clean up any stale pending/processing rows from previous failed or
    // abandoned attempts. Context: the payments table has a UNIQUE constraint
    // on (session_id, participant_user_id, status) — so if a user clicks
    // "Pay & Join", bounces out of Stripe without paying, and comes back to
    // try again, the still-pending row blocks the new INSERT with a 23505
    // duplicate-key error. Deleting the stale rows here is safe because any
    // payment row in pending/processing represents an in-flight Checkout that
    // never completed — no money moved. If a user legitimately has an open
    // Stripe session, they'll just get a fresh one; the old URL becomes a
    // dead link, which is the correct behavior.
    const { error: cleanupError } = await serviceSupabase
      .from('payments')
      .delete()
      .eq('session_id', session_id)
      .eq('participant_user_id', user.id)
      .in('status', ['pending', 'processing']);

    if (cleanupError) {
      // Non-fatal: log and continue. If the delete fails and a stale row
      // exists, the insert below will surface the real error.
      logError(cleanupError, {
        route: '/api/payment/create',
        action: 'cleanup_stale_payments',
        sessionId: session_id,
      });
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

    // Effective platform fee. Order of precedence:
    //   1. Session-level override (legacy `session.platform_fee_percent`)
    //   2. Tribe.OS premium creator → 0% (their $30/mo subscription replaces
    //      the 15% per-transaction Connect fee per the build plan)
    //   3. Default PLATFORM_FEE_PERCENT (15%)
    //
    // The premium check fails closed: any DB error or missing row falls
    // back to the standard fee. Worst case is a premium user is briefly
    // charged the fee on a session and we refund — better than silently
    // losing platform revenue on a transient lookup failure.
    const creatorPremiumResult = await isCreatorPremium(serviceSupabase, session.creator_id);
    const creatorIsPremium = creatorPremiumResult.success && creatorPremiumResult.data === true;

    let feePercent: number;
    if (session.platform_fee_percent !== null && session.platform_fee_percent !== undefined) {
      feePercent = session.platform_fee_percent;
    } else if (creatorIsPremium) {
      feePercent = 0;
    } else {
      feePercent = PLATFORM_FEE_PERCENT;
    }

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

    // Create payment record in DB.
    // T0-6: `discount_cents` and `promo_code_id` are NOT columns on `payments`
    // (they live on promo_redemptions / product_orders). Writing them 500'd
    // every promo-code checkout. The discount is recorded against the promo
    // code via redeemPromoCode() below, which writes the canonical
    // promo_redemptions row — so the payment row doesn't need to carry them.
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
      // USD session payment. Destination charge to instructor's Connect
      // account — refuse to create the session unless onboarding is done,
      // because otherwise Stripe will accept the Checkout creation but the
      // funds will settle to the platform with no way to forward them.
      if (!creatorProfile?.stripe_account_id || !creatorProfile?.stripe_onboarding_complete) {
        await serviceSupabase.from('payments').update({ status: 'error' }).eq('id', paymentId);
        logError(new Error('Instructor has not completed Stripe Connect onboarding'), {
          route: '/api/payment/create',
          action: 'stripe_session_missing_connect',
          sessionId: session_id,
          creatorId: session.creator_id,
          hasAccountId: !!creatorProfile?.stripe_account_id,
          onboardingComplete: !!creatorProfile?.stripe_onboarding_complete,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Instructor has not finished setting up payouts. Ask them to complete Connect onboarding.',
          },
          { status: 409 }
        );
      }

      const successUrl = `${siteUrl}/payment/confirm?payment_id=${paymentId}&gateway=stripe`;
      const cancelUrl = `${siteUrl}/session/${session_id}?payment=cancelled`;

      // PAYMENT_GATEWAY_OVERRIDE: COP can land here when the override forces
      // Stripe. App stores COP as `value × 100`; Stripe is zero-decimal.
      const stripeAmount = currency === 'COP' ? Math.round(amountCents / 100) : amountCents;
      const stripeAppFee = currency === 'COP' ? Math.round(platformFeeCents / 100) : platformFeeCents;
      const stripeResult = await createStripeCheckoutSession({
        amountCents: stripeAmount,
        currency,
        customerEmail: userEmail,
        sessionId: session_id,
        participantUserId: user.id,
        successUrl,
        cancelUrl,
        instructorStripeAccountId: creatorProfile.stripe_account_id,
        // Pass the exact DB-side platform fee so Stripe's split matches our
        // row. calculateFeesForUser() above already applied Tribe+ waivers.
        applicationFeeCents: stripeAppFee,
        productName: `Tribe Session — ${session.sport}`,
        paymentType: 'session_participation_fee',
      });

      if (!stripeResult?.url) {
        await serviceSupabase.from('payments').update({ status: 'error' }).eq('id', paymentId);
        return NextResponse.json({ success: false, error: 'Failed to create Stripe session' }, { status: 500 });
      }

      redirectUrl = stripeResult.url;

      // Store the Stripe Checkout Session id as the gateway handle.
      // NOTE: we intentionally do NOT set stripe_payment_intent_id here —
      // at create-time the PaymentIntent (pi_...) does not exist yet; only
      // the Checkout Session (cs_...) does. Writing the cs_ id into a
      // column named stripe_payment_intent_id was the root cause of
      // refunds never being matched (charge.refunded is keyed by pi_).
      // The real pi_ is backfilled by the checkout.session.completed
      // webhook handler.
      await serviceSupabase
        .from('payments')
        .update({
          gateway_payment_id: stripeResult.sessionId,
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
