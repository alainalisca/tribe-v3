/**
 * POST /api/tribe-os/ai/rescore-all
 *
 * Bulk rescore — runs the churn-scoring engine over every
 * non-archived client in the caller's gym, then auto-generates
 * CHURN_RISK insights for anyone scoring AT_RISK.
 *
 * Owner-only. Pure compute (no LLM). Each scored member emits its
 * own agent_run_log row; the rescore-all run itself emits a
 * summary log entry.
 *
 * Why we ship this as a manual button instead of waiting for the
 * nightly cron:
 *   1. The nightly cron doesn't exist yet (Phase D follow-up).
 *   2. Real-device walkthroughs need a way to make /os/intelligence
 *      light up immediately.
 *   3. After early-adopter gyms have ~100+ members, this becomes a
 *      "force re-evaluation" tool used when the owner just imported
 *      new attendance data or wants to verify a fresh prediction.
 *
 * Performance: scores are sequential (Supabase rate limits + RLS
 * recompute makes parallel writes risky on cold caches). Expect
 * ~250-400ms per member at p99 — a 100-member gym takes ~30s.
 * Capped at MAX_MEMBERS to keep response time bounded; callers
 * with bigger rosters page through the response.
 *
 * Response (200):
 *   { success: true, data: {
 *       scored: number,
 *       skipped_new_member: number,
 *       at_risk_count: number,
 *       insights_created: number,
 *       insights_skipped_duplicate: number,
 *       duration_ms: number,
 *     } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { aiLogger } from '@/lib/ai/logger';
import { AI_FEATURES } from '@/lib/ai/config';
import { runIntelligenceForGym, type IntelligenceRunSummary } from '@/lib/ai/run-intelligence';
import type { AIResponse } from '@/lib/ai/types';

const MAX_MEMBERS = 200;

export async function POST(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!AI_FEATURES.CHURN_PREDICTION.enabled) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'FEATURE_DISABLED', message: 'Churn prediction is disabled.', retryable: false },
      },
      { status: 503 }
    );
  }

  try {
    // Resolve gym + verify ownership. We restrict rescore-all to
    // owners because the operation can produce a flurry of insights
    // and we don't want a non-owner triggering it.
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_GYM', message: 'No gym found for this user.', retryable: false } },
        { status: 404 }
      );
    }
    if (gymRes.data.owner_user_id !== userId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'OWNER_ONLY', message: 'Only the gym owner can run bulk rescoring.', retryable: false },
        },
        { status: 403 }
      );
    }
    const effectiveGymId = gymRes.data.id;

    const log = aiLogger(AI_FEATURES.CHURN_PREDICTION.id, effectiveGymId);
    log.start('none');

    const summary = await runIntelligenceForGym(effectiveGymId, { maxMembers: MAX_MEMBERS });
    if (!summary) {
      log.failure('SERVICE_ROLE_MISSING');
      return NextResponse.json(
        { success: false, error: { code: 'SERVER_MISCONFIGURED', message: 'service_role_missing', retryable: false } },
        { status: 500 }
      );
    }

    const meta = log.success({ inputTokens: 0, outputTokens: 0 });

    const body: AIResponse<IntelligenceRunSummary> = { success: true, data: summary, meta };
    return NextResponse.json(body);
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/ai/rescore-all' });
    const body: AIResponse<IntelligenceRunSummary> = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
