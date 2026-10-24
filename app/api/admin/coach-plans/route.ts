/**
 * POST /api/admin/coach-plans   (T-PLAN1 part B)
 *
 * Body: { userId: uuid, action: 'grant', plan: 'embajador' | 'pro' | 'crecimiento' }
 *     | { userId: uuid, action: 'revoke' }
 *
 * Comps a plan for an ambassador (Andres and Salomon first) or removes it.
 * Admins only, via requireApiAdmin() (is_app_admin(), the DB flag; the email
 * allowlist in isAdmin() is being retired under SEC-03). The write uses the
 * service role because migration 231's guard refuses every client write to
 * coach_plan*, admins included. granted_by is the calling admin.
 *
 *   404 coach plans are off
 *   403 not an admin
 *   400 invalid body
 *   404 user not found / revoke on something that is not a comp
 *   409 the user pays through Stripe (cancel in the portal first)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth/adminApi';
import { log, logError } from '@/lib/logger';
import { grantCoachPlanComp, revokeCoachPlanComp } from '@/lib/dal/coachPlans';
import { isCoachPlansEnabled } from '@/lib/subscription/coachPlans';

const ROUTE = 'POST /api/admin/coach-plans';

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    userId: z.string().uuid(),
    action: z.literal('grant'),
    plan: z.enum(['embajador', 'pro', 'crecimiento']),
  }),
  z.object({ userId: z.string().uuid(), action: z.literal('revoke') }),
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isCoachPlansEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const gate = await requireApiAdmin();
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const body = parsed.data;

  try {
    const result =
      body.action === 'grant'
        ? await grantCoachPlanComp(gate.service, body.userId, body.plan, gate.userId)
        : await revokeCoachPlanComp(gate.service, body.userId);

    if (!result.success || !result.data) {
      const error = result.error ?? 'unknown';
      if (error === 'user_not_found' || error === 'not_a_comp') return NextResponse.json({ error }, { status: 404 });
      if (error === 'has_stripe_subscription') return NextResponse.json({ error }, { status: 409 });
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }

    log('info', 'coach_plan_comp_changed', {
      route: ROUTE,
      action: body.action,
      actorUserId: gate.userId,
      targetUserId: body.userId,
      plan: result.data.coach_plan,
    });
    return NextResponse.json({
      success: true,
      user: {
        id: result.data.id,
        coach_plan: result.data.coach_plan,
        coach_plan_source: result.data.coach_plan_source,
        coach_plan_granted_at: result.data.coach_plan_granted_at,
      },
    });
  } catch (error) {
    logError(error, { route: ROUTE, actorUserId: gate.userId });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
