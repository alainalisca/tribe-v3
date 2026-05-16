/**
 * POST /api/tribe-os/subscription/checkout
 *
 * Creates a Stripe Checkout Session in subscription mode for the
 * Tribe.OS premium tier. Returns the URL the client should redirect
 * to. The actual subscription is created once the user completes
 * payment in Stripe-hosted Checkout — at that point Stripe fires
 * customer.subscription.created which the webhook handler picks up
 * and syncs into the user's tribe_os_* columns.
 *
 * Flow:
 *   1. Authenticate the caller (must be signed in).
 *   2. If they're already premium-active, return 409 with a hint to
 *      manage via /api/tribe-os/subscription/portal instead.
 *   3. Look up tribe_os_stripe_customer_id; create + persist a Stripe
 *      customer if missing.
 *   4. Create a Checkout Session and return its URL.
 *
 * Body: empty (or future: { tier: 'solo' | 'team_studio' } when team
 * tier exists). Currently always solo.
 *
 * Response: 200 { success: true, url: string }
 *           401 unauthenticated
 *           409 already premium (caller should redirect to portal)
 *           500 stripe / config error
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { createTribeOSStripeCustomer, createTribeOSCheckoutSession } from '@/lib/payments/stripe';
import { setTribeOSStripeCustomerId } from '@/lib/dal/tribeOSSubscription';
import { isTribeOSPremiumActive } from '@/lib/dal/tribeOSPremium';
import { createGym, getGymForUser, updateGym } from '@/lib/dal/gyms';
import { addCoachToGym } from '@/lib/dal/gymCoaches';

interface PremiumRow {
  tribe_os_tier: 'solo' | 'team_studio' | null;
  tribe_os_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null;
  tribe_os_stripe_customer_id: string | null;
}

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    if (!user.email) {
      return NextResponse.json({ success: false, error: 'email_required' }, { status: 400 });
    }

    // Use service-role for the user-row read + write so RLS doesn't
    // block reading tribe_os_stripe_customer_id (RLS on users likely
    // restricts certain columns to self-only or service-only).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: 'server_misconfigured' }, { status: 500 });
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error: rowErr } = await service
      .from('users')
      .select('tribe_os_tier, tribe_os_status, tribe_os_stripe_customer_id, name')
      .eq('id', user.id)
      .single();
    if (rowErr || !row) {
      logError(rowErr ?? new Error('user row not found'), {
        action: 'tribe_os_checkout.user_lookup',
        userId: user.id,
      });
      return NextResponse.json({ success: false, error: 'user_lookup_failed' }, { status: 500 });
    }
    const premiumRow = row as PremiumRow & { name: string | null };

    // 409 if already on premium — they should manage via the portal.
    if (isTribeOSPremiumActive(premiumRow)) {
      return NextResponse.json(
        { success: false, error: 'already_premium', hint: 'use_portal_instead' },
        { status: 409 }
      );
    }

    // Get or create Stripe customer.
    let customerId = premiumRow.tribe_os_stripe_customer_id ?? null;
    if (!customerId) {
      const customerResult = await createTribeOSStripeCustomer({
        email: user.email,
        userId: user.id,
        name: premiumRow.name,
      });
      if (!customerResult.success) {
        return NextResponse.json({ success: false, error: customerResult.error }, { status: 500 });
      }
      customerId = customerResult.customerId;
      const persistResult = await setTribeOSStripeCustomerId(service, user.id, customerId);
      if (!persistResult.success) {
        // Customer already exists in Stripe but we couldn't persist
        // the id. Surface the failure — repeating the call will create
        // ANOTHER Stripe customer, which we want to avoid.
        logError(new Error(`persist_stripe_customer_id_failed: ${persistResult.error ?? ''}`), {
          action: 'tribe_os_checkout.persist_customer',
          userId: user.id,
          customerId,
        });
        return NextResponse.json({ success: false, error: 'failed_to_persist_customer' }, { status: 500 });
      }
    }

    // Ensure the user has a gym (gym-tenant model, migration 068+).
    // The gym is the unit of subscription billing — the webhook handler
    // syncs status onto it via stripe_customer_id (and later
    // stripe_subscription_id). We resolve or create here so the webhook
    // never has to fall back to ad-hoc gym creation, which would race
    // against a UI flow that depends on the gym being present.
    const gymRes = await getGymForUser(service, user.id);
    if (!gymRes.success) {
      logError(new Error(`gym_lookup_failed: ${gymRes.error ?? ''}`), {
        action: 'tribe_os_checkout.gym_lookup',
        userId: user.id,
      });
      return NextResponse.json({ success: false, error: 'failed_to_resolve_gym' }, { status: 500 });
    }
    if (!gymRes.data) {
      const display = premiumRow.name || user.email.split('@')[0] || 'Solo Practice';
      const created = await createGym(service, {
        name: display,
        ownerUserId: user.id,
        // Tier and status get populated by the webhook after Checkout
        // completes. Until then the gym exists in a pre-billing state.
        stripeCustomerId: customerId,
      });
      if (!created.success) {
        logError(new Error(`gym_create_failed: ${created.error ?? ''}`), {
          action: 'tribe_os_checkout.gym_create',
          userId: user.id,
        });
        return NextResponse.json({ success: false, error: 'failed_to_create_gym' }, { status: 500 });
      }
      const newGymId = created.data!.id;
      // Owner needs the gym_coaches row for dual-path RLS to work.
      await addCoachToGym(service, newGymId, user.id, 'owner');
    } else if (!gymRes.data.tribe_os_stripe_customer_id) {
      // Existing gym (e.g. backfilled in migration 069) without a Stripe
      // customer id yet. Tag it so the webhook can find it on the first
      // subscription event.
      const tagged = await updateGym(service, gymRes.data.id, { stripeCustomerId: customerId });
      if (!tagged.success) {
        logError(new Error(`gym_tag_customer_failed: ${tagged.error ?? ''}`), {
          action: 'tribe_os_checkout.gym_tag_customer',
          userId: user.id,
          gymId: gymRes.data.id,
        });
        // Non-fatal — webhook can fall back to owner_user_id lookup.
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const checkoutResult = await createTribeOSCheckoutSession({
      customerId,
      userId: user.id,
      successUrl: `${siteUrl}/os/dashboard?subscribed=true`,
      cancelUrl: `${siteUrl}/#tribe-os`,
    });
    if (!checkoutResult.success) {
      return NextResponse.json({ success: false, error: checkoutResult.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: checkoutResult.url });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/subscription/checkout' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
