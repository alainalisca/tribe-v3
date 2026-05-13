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
import { scoreMember, hasEnoughHistory, newMemberDefault } from '@/lib/ai/churn-scoring';
import { fetchChurnSignals, persistMemberScore } from '@/lib/ai/data-access';
import { aiLogger } from '@/lib/ai/logger';
import { AI_FEATURES } from '@/lib/ai/config';
import { generateChurnInsights } from '@/lib/ai/insight-generator';
import type { AIResponse, ScoreOutput } from '@/lib/ai/types';

const MAX_MEMBERS = 200;

interface RescoreAllOutput {
  scored: number;
  skipped_new_member: number;
  at_risk_count: number;
  insights_created: number;
  insights_skipped_duplicate: number;
  duration_ms: number;
}

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

  const startTime = Date.now();

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

    // Pull every non-archived client in the gym.
    const { data: clientRows, error: clientsErr } = await supabase
      .from('clients')
      .select('id, name, gym_id')
      .eq('gym_id', effectiveGymId)
      .eq('archived', false)
      .limit(MAX_MEMBERS);
    if (clientsErr) {
      log.failure('CLIENT_LIST_FAILED');
      logError(clientsErr, { action: 'rescore_all.list_clients', gymId: effectiveGymId });
      return NextResponse.json(
        { success: false, error: { code: 'CLIENT_LIST_FAILED', message: clientsErr.message, retryable: true } },
        { status: 500 }
      );
    }

    const scoredMembers: Array<{ score: ScoreOutput; member: { id: string; name: string; gym_id: string } }> = [];
    let scored = 0;
    let skippedNewMember = 0;
    let atRiskCount = 0;

    // Score each member sequentially. Parallelizing is tempting but
    // each scoreMember kicks off fetchChurnSignals which does its
    // own subqueries (clients row + training_partners count); the
    // serial path is ~30s for 100 members which is acceptable for
    // a manual button and avoids hammering Supabase rate limits.
    for (const c of clientRows ?? []) {
      const member = { id: c.id as string, name: c.name as string, gym_id: c.gym_id as string };
      const signals = await fetchChurnSignals(member.id, effectiveGymId);
      if (!signals) continue;

      let scoreOutput: ScoreOutput;
      if (!hasEnoughHistory(signals.joinedAt)) {
        scoreOutput = newMemberDefault(member.id);
        skippedNewMember += 1;
      } else {
        scoreOutput = scoreMember({ memberId: member.id, signals: signals.signals });
      }

      await persistMemberScore(member.id, {
        churnRiskScore: scoreOutput.churnRiskScore,
        healthStatus: scoreOutput.healthStatus,
      });
      scored += 1;
      if (scoreOutput.healthStatus === 'AT_RISK') {
        atRiskCount += 1;
        scoredMembers.push({ score: scoreOutput, member });
      }
    }

    // Insight generation runs on the AT_RISK subset only.
    const insightSummary = await generateChurnInsights(effectiveGymId, scoredMembers);

    const meta = log.success({ inputTokens: 0, outputTokens: 0 });

    const data: RescoreAllOutput = {
      scored,
      skipped_new_member: skippedNewMember,
      at_risk_count: atRiskCount,
      insights_created: insightSummary.insights_created,
      insights_skipped_duplicate: insightSummary.insights_skipped_duplicate,
      duration_ms: Date.now() - startTime,
    };

    const body: AIResponse<RescoreAllOutput> = { success: true, data, meta };
    return NextResponse.json(body);
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/ai/rescore-all' });
    const body: AIResponse<RescoreAllOutput> = {
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
