/**
 * POST /api/coach-plans/checkout   (T-PLAN1)
 *
 * Body: { plan: 'pro' | 'crecimiento' }
 *
 * Creates a Stripe Checkout Session in subscription mode for a paid coach plan
 * and returns its URL. The plan becomes active when Stripe's webhook arrives
 * (checkout.session.completed / customer.subscription.created), never here.
 *
 *   404 coach plans are off (COACH_PLANS_ENABLED); the route behaves as if absent
 *   401 not signed in
 *   403 not an instructor or gym account
 *   409 already on a paid plan (manage it in the portal) or on a comp
 *   503 the plan's Stripe price is not configured
 *   500 Stripe or database error
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';
import { fetchCoachPlanRow, setCoachPlanCustomerId } from '@/lib/dal/coachPlans';
import { createCoachPlanCheckoutSession, createCoachPlanCustomer } from '@/lib/payments/coachPlanStripe';
import { coachPlanPriceId, hasProBenefits, isCoachPlansEnabled } from '@/lib/subscription/coachPlans';

const ROUTE = 'POST /api/coach-plans/checkout';
const bodySchema = z.object({ plan: z.enum(['pro', 'crecimiento']) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCoachPlansEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: 'email_required' }, { status: 400 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  const { plan } = parsed.data;

  const priceId = coachPlanPriceId(plan);
  if (!priceId) {
    logError(new Error('coach_plan_price_not_configured'), { route: ROUTE, plan });
    return NextResponse.json({ error: 'plan_not_configured' }, { status: 503 });
  }

  try {
    const service = getServiceRoleClient();
    const rowResult = await fetchCoachPlanRow(service, user.id);
    if (!rowResult.success || !rowResult.data) {
      return NextResponse.json({ error: 'user_lookup_failed' }, { status: 500 });
    }
    const row = rowResult.data;
    if (!row.is_instructor) return NextResponse.json({ error: 'instructors_only' }, { status: 403 });
    if (row.coach_plan_source === 'comp' && row.coach_plan !== 'basico') {
      return NextResponse.json({ error: 'comped' }, { status: 409 });
    }
    if (hasProBenefits(row)) {
      return NextResponse.json({ error: 'already_subscribed', hint: 'use_portal' }, { status: 409 });
    }

    let customerId = row.coach_plan_stripe_customer_id;
    if (!customerId) {
      const created = await createCoachPlanCustomer({ email: user.email, userId: user.id, name: row.name });
      if (!created.success) return NextResponse.json({ error: 'stripe_customer_failed' }, { status: 500 });
      customerId = created.customerId;
      const saved = await setCoachPlanCustomerId(service, user.id, customerId);
      if (!saved.success) return NextResponse.json({ error: 'customer_save_failed' }, { status: 500 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
    const session = await createCoachPlanCheckoutSession({
      customerId,
      priceId,
      plan,
      userId: user.id,
      successUrl: `${siteUrl}/planes/?checkout=success`,
      cancelUrl: `${siteUrl}/planes/?checkout=canceled`,
    });
    if (!session.success) return NextResponse.json({ error: 'stripe_checkout_failed' }, { status: 500 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    logError(error, { route: ROUTE, userId: user.id });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
