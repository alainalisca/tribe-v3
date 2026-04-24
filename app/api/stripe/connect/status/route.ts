/**
 * GET /api/stripe/connect/status
 *
 * Returns the current Stripe Connect status for the authenticated instructor.
 * The UI polls this to render the correct badge ("Not connected" /
 * "In progress" / "Active") without needing a full page refresh.
 *
 * Response shape:
 *   {
 *     success: true,
 *     state: 'not_started' | 'in_progress' | 'complete',
 *     account_id: string | null,   // only for in_progress / complete
 *     charges_enabled: boolean,    // only for in_progress / complete
 *     payouts_enabled: boolean,
 *     requirements_due: string[],  // field names Stripe still needs, if any
 *   }
 *
 * For in_progress states we hit Stripe (not just the DB) so the requirements
 * list is fresh. For complete states we can serve from the DB to save an
 * API round-trip, because the webhook keeps the flag in sync.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { getStripeConnectAccount, isStripeAccountReady } from '@/lib/payments/stripe';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const serviceSupabase = createServiceClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: profileError } = await serviceSupabase
      .from('users')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    if (!profile.stripe_account_id) {
      return NextResponse.json({
        success: true,
        state: 'not_started',
        account_id: null,
        charges_enabled: false,
        payouts_enabled: false,
        requirements_due: [],
      });
    }

    // If the DB says complete, trust it — webhook keeps it accurate and this
    // saves a Stripe API call on every poll.
    if (profile.stripe_onboarding_complete) {
      return NextResponse.json({
        success: true,
        state: 'complete',
        account_id: profile.stripe_account_id,
        charges_enabled: true,
        payouts_enabled: true,
        requirements_due: [],
      });
    }

    // In-progress: ask Stripe directly so we can surface the specific fields
    // the instructor still needs to fill in.
    const account = await getStripeConnectAccount(profile.stripe_account_id);
    if (!account) {
      return NextResponse.json({
        success: true,
        state: 'in_progress',
        account_id: profile.stripe_account_id,
        charges_enabled: false,
        payouts_enabled: false,
        requirements_due: [],
      });
    }

    const ready = isStripeAccountReady(account);
    // If Stripe now says ready but our DB flag is still false, patch it.
    // The webhook should have done this, but maybe it got dropped.
    if (ready) {
      await serviceSupabase.from('users').update({ stripe_onboarding_complete: true }).eq('id', user.id);
    }

    return NextResponse.json({
      success: true,
      state: ready ? 'complete' : 'in_progress',
      account_id: profile.stripe_account_id,
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      requirements_due: account.requirements?.currently_due ?? [],
    });
  } catch (error) {
    logError(error, { route: '/api/stripe/connect/status' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
