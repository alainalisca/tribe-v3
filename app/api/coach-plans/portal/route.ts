/**
 * POST /api/coach-plans/portal   (T-PLAN1)
 *
 * Opens the Stripe Customer Portal for the signed-in coach's coach-plan
 * customer, so they update their card or cancel on their own. Returns { url }.
 *
 *   404 coach plans are off, or the coach has never had a Stripe plan
 *   401 not signed in
 *   500 Stripe or database error
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';
import { fetchCoachPlanRow } from '@/lib/dal/coachPlans';
import { createCoachPlanPortalSession } from '@/lib/payments/coachPlanStripe';
import { isCoachPlansEnabled } from '@/lib/subscription/coachPlans';

const ROUTE = 'POST /api/coach-plans/portal';

export async function POST(): Promise<NextResponse> {
  if (!isCoachPlansEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const row = await fetchCoachPlanRow(getServiceRoleClient(), user.id);
    if (!row.success || !row.data) return NextResponse.json({ error: 'user_lookup_failed' }, { status: 500 });
    const customerId = row.data.coach_plan_stripe_customer_id;
    if (!customerId) return NextResponse.json({ error: 'no_subscription' }, { status: 404 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const portal = await createCoachPlanPortalSession({ customerId, returnUrl: `${siteUrl}/planes/` });
    if (!portal.success) return NextResponse.json({ error: 'stripe_portal_failed' }, { status: 500 });
    return NextResponse.json({ url: portal.url });
  } catch (error) {
    logError(error, { route: ROUTE, userId: user.id });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
