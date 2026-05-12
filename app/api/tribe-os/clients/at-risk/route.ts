/**
 * GET /api/tribe-os/clients/at-risk
 *
 * Returns clients flagged as at-risk by the dashboard widget. See
 * lib/dal/clients.ts listAtRiskClients for the rule set: active
 * clients gone quiet for thresholdDays, manually-marked lapsed, and
 * leads that never converted.
 *
 * Query params:
 *   thresholdDays — int, 1..365, default 14. The "gone quiet" window.
 *   limit         — int, 1..100,  default 25. Max rows returned.
 *
 * Response (200): { success: true, data: AtRiskClient[] }
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
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? 'invalid_query' },
        { status: 400 }
      );
    }

    const result = await listAtRiskClients(
      supabase,
      { gymId: gymId ?? null, instructorUserId: userId },
      {
        thresholdDays: parsed.data.thresholdDays,
        limit: parsed.data.limit,
      }
    );

    if (!result.success) {
      logError(new Error(result.error ?? 'unknown'), {
        action: 'clients_at_risk.dal',
        userId,
        gymId,
      });
      return NextResponse.json({ success: false, error: result.error ?? 'at_risk_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/at-risk' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
