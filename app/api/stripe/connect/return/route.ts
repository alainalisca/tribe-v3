/**
 * GET /api/stripe/connect/return
 *
 * Stripe redirects the instructor here when they finish the hosted onboarding
 * flow (success OR abandonment — Stripe uses the same return_url for both).
 *
 * Responsibilities:
 *   1. Verify the user is authenticated and is the owner of the account.
 *   2. Ask Stripe (not the redirect, which is untrusted) whether the account
 *      is actually charges_enabled + payouts_enabled.
 *   3. If yes, set users.stripe_onboarding_complete = true. (The webhook will
 *      usually do this first, but we do it here as a belt-and-suspenders so
 *      the UI reflects status immediately on return, without waiting for
 *      webhook delivery.)
 *   4. Redirect the user back into the app — payout settings page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { getStripeConnectAccount, isStripeAccountReady } from '@/lib/payments/stripe';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(_request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const failureRedirect = `${siteUrl}/earnings/payout-settings?stripe=incomplete`;
  const successRedirect = `${siteUrl}/earnings/payout-settings?stripe=complete`;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(`${siteUrl}/auth?next=/earnings/payout-settings`);
    }

    const serviceSupabase = createServiceClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await serviceSupabase
      .from('users')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_account_id) {
      // Shouldn't happen — if we're hitting the return route, we'd earlier
      // have set the account id. Fall through to the UI with a noisy flag.
      return NextResponse.redirect(failureRedirect);
    }

    // Confirm with Stripe (don't trust the redirect). If the user bailed mid-
    // flow, charges_enabled and payouts_enabled will be false.
    const account = await getStripeConnectAccount(profile.stripe_account_id);
    if (!account) {
      return NextResponse.redirect(failureRedirect);
    }

    const ready = isStripeAccountReady(account);

    if (ready && !profile.stripe_onboarding_complete) {
      const { error: updateError } = await serviceSupabase
        .from('users')
        .update({ stripe_onboarding_complete: true })
        .eq('id', user.id);

      if (updateError) {
        logError(updateError, {
          action: 'stripe_return_flip_complete',
          userId: user.id,
          accountId: profile.stripe_account_id,
        });
        // Don't block the redirect — the webhook will catch up.
      }
    }

    return NextResponse.redirect(ready ? successRedirect : failureRedirect);
  } catch (error) {
    logError(error, { route: '/api/stripe/connect/return' });
    return NextResponse.redirect(failureRedirect);
  }
}
