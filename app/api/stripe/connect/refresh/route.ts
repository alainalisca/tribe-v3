/**
 * GET /api/stripe/connect/refresh
 *
 * Stripe redirects the instructor here when an AccountLink expires or fails
 * mid-onboarding. We just mint a fresh AccountLink and redirect them back
 * into Stripe's hosted flow so they can pick up where they left off.
 *
 * This route has side effects (creates a new AccountLink), but we keep it as
 * GET because Stripe's redirect mechanism uses GET. The write is to Stripe,
 * not to our DB, and it's idempotent from the user's perspective.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import { createStripeConnectOnboardingLink } from '@/lib/payments/stripe';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * PAY-01: instructor payments are OFF until Tribe's banking is resolved.
 * Stripe Connect onboarding is the front door to Tribe processing payments
 * for instructors, so every /api/stripe/connect/* route refuses until
 * INSTRUCTOR_PAYMENTS_ENABLED is the literal 'true'. Absent means off.
 * Duplicated per route on purpose, matching isBillingEnabled() in the
 * Tribe.OS checkout route; read at call time, not at module load.
 */
function isInstructorPaymentsEnabled(): boolean {
  return process.env.INSTRUCTOR_PAYMENTS_ENABLED === 'true';
}

export async function GET(_request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const fallbackRedirect = `${siteUrl}/earnings/payout-settings?stripe=refresh_failed`;

  try {
    if (!isInstructorPaymentsEnabled()) {
      // 503, not 403: this is "not open yet", not "you may not". Logged so an
      // attempt while the switch is off is visible rather than silent.
      log('warn', 'instructor_payments_blocked', {
        route: 'GET /api/stripe/connect/refresh',
        action: 'payments_disabled',
      });
      return NextResponse.json({ success: false, error: 'payments_disabled' }, { status: 503 });
    }

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
      .select('stripe_account_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_account_id) {
      return NextResponse.redirect(fallbackRedirect);
    }

    const link = await createStripeConnectOnboardingLink({
      accountId: profile.stripe_account_id,
      refreshUrl: `${siteUrl}/api/stripe/connect/refresh`,
      returnUrl: `${siteUrl}/api/stripe/connect/return`,
    });

    if (!link) {
      return NextResponse.redirect(fallbackRedirect);
    }

    return NextResponse.redirect(link.url);
  } catch (error) {
    logError(error, { route: '/api/stripe/connect/refresh' });
    return NextResponse.redirect(fallbackRedirect);
  }
}
