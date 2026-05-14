/**
 * GET /api/tribe-os/clients/at-risk
 *
 * Returns clients flagged as at-risk by the dashboard widget plus a
 * total-clients count so the widget can distinguish between "you
 * have no clients yet" (different empty state — encourage the user
 * to add one) and "you have clients, none are at risk right now"
 * (affirming empty state). See lib/dal/clients.ts listAtRiskClients
 * for the at-risk rule set.
 *
 * Query params:
 *   thresholdDays — int, 1..365, default 14. The "gone quiet" window.
 *   limit         — int, 1..100,  default 25. Max rows returned.
 *
 * Response (200): { success: true, data: { at_risk: AtRiskClient[], total_clients: number } }
 * Failures: 400 invalid query, 401 unauthorized, 403 not premium,
 * 500 server error.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { listAtRiskClients } from '@/lib/dal/clients';

const querySchema = z.object({
  thresholdDays: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 1 && v <= 365), {
      message: 'thresholdDays must be an integer between 1 and 365',
    }),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 1 && v <= 100), {
      message: 'limit must be an integer between 1 and 100',
    }),
  // team_id scoped to a single team's members. UUID-ish shape is
  // good enough — the DAL passes it to PostgREST which validates.
  team_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      thresholdDays: searchParams.get('thresholdDays') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      team_id: searchParams.get('team_id') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'invalid_query' },
        { status: 400 }
      );
    }

    // Parallel: at-risk list + a total-count probe on the same
    // clients table. The total-count probe scopes by gym (preferred)
    // or instructor and skips archived rows; same RLS filtering as
    // the at-risk query, so they always agree on the tenant.
    let countQuery = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('archived', false);
    if (gymId) {
      countQuery = countQuery.eq('gym_id', gymId);
    } else {
      countQuery = countQuery.eq('instructor_user_id', userId);
    }

    const [atRiskResult, countResult] = await Promise.all([
      listAtRiskClients(
        supabase,
        { gymId: gymId ?? null, instructorUserId: userId },
        {
          thresholdDays: parsed.data.thresholdDays,
          limit: parsed.data.limit,
          teamId: parsed.data.team_id,
        }
      ),
      countQuery,
    ]);

    if (!atRiskResult.success) {
      logError(new Error(atRiskResult.error ?? 'unknown'), {
        action: 'clients_at_risk.dal',
        userId,
        gymId,
      });
      return NextResponse.json({ success: false, error: atRiskResult.error ?? 'at_risk_failed' }, { status: 500 });
    }

    if (countResult.error) {
      // Non-fatal: surface the at-risk list with total_clients = null
      // so the widget falls back to the existing affirming empty
      // state. Better than 500-ing the whole endpoint.
      logError(countResult.error, {
        action: 'clients_at_risk.count',
        userId,
        gymId,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        at_risk: atRiskResult.data ?? [],
        total_clients: countResult.error ? null : (countResult.count ?? 0),
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/at-risk' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
