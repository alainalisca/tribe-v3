/**
 * POST /api/tribe-os/intelligence/[id]/feedback
 *
 * Coach feedback on a single insight + dismiss in one shot. Body:
 *   { signal: 'helpful' | 'false_positive' }
 *
 * Stored in data_payload.feedback alongside the existing template +
 * score-breakdown keys — no schema migration needed. Later we can
 * aggregate by signal-per-type to tune the generator heuristics
 * (e.g. lower the CHURN_RISK score threshold if 'helpful' rate is
 * dominant, or raise it if false-positive rate is high).
 *
 * Companion to /api/tribe-os/intelligence/[id]/dismiss — that one
 * is for skip-without-feedback. This one is for the explicit
 * "👍 helpful" / "👎 not useful" chips on the insight card.
 *
 * Auth: Tribe.OS premium gate. RLS handles the tenant scope.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { actionInsightWithFeedback } from '@/lib/dal/communityInsights';

const BodySchema = z.object({
  signal: z.enum(['helpful', 'false_positive']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: insightId } = await params;
    if (!insightId) {
      return NextResponse.json({ success: false, error: 'insight_id_required' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = BodySchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { success: false, error: error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 }
        );
      }
      throw error;
    }

    const result = await actionInsightWithFeedback(supabase, insightId, parsed.signal);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'feedback_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/intelligence/[id]/feedback' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
