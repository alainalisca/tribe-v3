/**
 * POST /api/tribe-os/subscription/portal
 *
 * Creates a Stripe Customer Portal session so the user can cancel,
 * update payment method, or view invoices for their Tribe.OS
 * subscription. Returns the portal URL for client redirect.
 *
 * Requires the caller to have a tribe_os_stripe_customer_id (i.e.
 * they've gone through Checkout at least once). Manually-granted
 * design-partner accounts (no Stripe customer) get 404 — they don't
 * have anything to manage.
 *
 * Response: 200 { success: true, url: string }
 *           401 unauthenticated
 *           404 no Stripe customer to manage
 *           500 stripe error
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { createTribeOSCustomerPortalSession } from '@/lib/payments/stripe';

export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

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
      .select('tribe_os_stripe_customer_id')
      .eq('id', user.id)
      .single();
    if (rowErr || !row) {
      logError(rowErr ?? new Error('user row not found'), {
        action: 'tribe_os_portal.user_lookup',
        userId: user.id,
      });
      return NextResponse.json({ success: false, error: 'user_lookup_failed' }, { status: 500 });
    }

    const customerId = (row as { tribe_os_stripe_customer_id: string | null }).tribe_os_stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ success: false, error: 'no_stripe_customer' }, { status: 404 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const portalResult = await createTribeOSCustomerPortalSession({
      customerId,
      returnUrl: `${siteUrl}/os/dashboard`,
    });
    if (!portalResult.success) {
      return NextResponse.json({ success: false, error: portalResult.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: portalResult.url });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/subscription/portal' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
