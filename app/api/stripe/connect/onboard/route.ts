/**
 * POST /api/stripe/connect/onboard
 *
 * Generates a one-time Stripe-hosted onboarding URL for an instructor.
 *
 * Flow:
 *   1. Caller must be an authenticated instructor.
 *   2. If the user has no stripe_account_id yet, create an Express Connect
 *      account and persist the ID.
 *   3. Generate a fresh AccountLink (expires in ~minutes) and return its URL.
 *   4. The client redirects window.location to that URL.
 *   5. When Stripe finishes (or the link expires mid-flow), the user lands on
 *      /api/stripe/connect/return or /api/stripe/connect/refresh.
 *
 * Why POST (not GET): this route has side effects — it can create a new
 * Connect account and mutate users.stripe_onboarding_started_at. GET should
 * be idempotent / safe to retry from the browser history, which this isn't.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { createStripeConnectAccount, createStripeConnectOnboardingLink } from '@/lib/payments/stripe';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Service-role client: we write stripe_account_id and
    // stripe_onboarding_started_at, both of which are service-managed
    // (not user-editable) per the migration comments.
    const serviceSupabase = createServiceClient(supabaseUrl, serviceRoleKey);

    // Load the user's profile: need to check is_instructor and read any
    // existing stripe_account_id so we don't create duplicate accounts
    // on repeated button clicks.
    const { data: profile, error: profileError } = await serviceSupabase
      .from('users')
      .select('id, email, is_instructor, stripe_account_id, stripe_onboarding_complete')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logError(profileError, { action: 'stripe_onboard_load_profile', userId: user.id });
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.is_instructor) {
      return NextResponse.json({ success: false, error: 'Only instructors can set up payouts' }, { status: 403 });
    }

    // If they're already fully onboarded, there's no reason to send them
    // through onboarding again — surface the dashboard login link route
    // (/api/stripe/connect/dashboard) instead. For now we just 409.
    if (profile.stripe_onboarding_complete && profile.stripe_account_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Onboarding already complete',
          stripe_account_id: profile.stripe_account_id,
        },
        { status: 409 }
      );
    }

    // Step 1: ensure the user has a Connect account.
    let accountId = profile.stripe_account_id as string | null;
    if (!accountId) {
      const account = await createStripeConnectAccount(profile.email, 'US');
      if (!account) {
        return NextResponse.json({ success: false, error: 'Failed to create Stripe Connect account' }, { status: 502 });
      }
      accountId = account.accountId;

      const { error: updateError } = await serviceSupabase
        .from('users')
        .update({
          stripe_account_id: accountId,
          stripe_onboarding_started_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) {
        // If we fail to persist the account id, the account still exists in
        // Stripe but is orphaned for this user. That's recoverable manually
        // but shouldn't happen — surface a 500 so the error tracker picks it
        // up for triage.
        logError(updateError, {
          action: 'stripe_onboard_persist_account_id',
          userId: user.id,
          accountId,
        });
        return NextResponse.json({ success: false, error: 'Failed to save Stripe account id' }, { status: 500 });
      }
    }

    // Step 2: generate the hosted onboarding URL. We always generate a new
    // link (never cache) because AccountLinks are single-use and short-lived.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const link = await createStripeConnectOnboardingLink({
      accountId,
      refreshUrl: `${siteUrl}/api/stripe/connect/refresh`,
      returnUrl: `${siteUrl}/api/stripe/connect/return`,
    });

    if (!link) {
      return NextResponse.json({ success: false, error: 'Failed to create onboarding link' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      url: link.url,
      expires_at: link.expiresAt,
    });
  } catch (error) {
    logError(error, { route: '/api/stripe/connect/onboard' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
