/**
 * POST /api/tribe-os/ai/rescore-member
 *
 * Feature 1.1 — Manual rescore of a single member's churn risk.
 * Called when an owner/coach wants an up-to-date score without
 * waiting for the nightly batch.
 *
 * Request body: { client_id: string }
 *
 * Flow:
 *   1. Premium gate (every AI feature requires Tribe.OS premium).
 *   2. Fetch the live signals from clients + training_partners.
 *   3. If the client has < 14 days of history, return a neutral
 *      HEALTHY score without scoring.
 *   4. Otherwise: score with the weighted heuristic, persist the
 *      result onto the clients row, log the run to agent_run_log,
 *      and return the score + breakdown.
 *
 * No LLM call — pure compute, p99 < 500ms.
 *
 * Response:
 *   { success: true, data: ScoreOutput, meta: { ... } }
 *   { success: false, error: { code, message, retryable } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { scoreMember, hasEnoughHistory, newMemberDefault } from '@/lib/ai/churn-scoring';
import { fetchChurnSignals, persistMemberScore } from '@/lib/ai/data-access';
import { aiLogger } from '@/lib/ai/logger';
import { AI_FEATURES } from '@/lib/ai/config';
import type { AIResponse, ScoreOutput } from '@/lib/ai/types';

const RescoreInputSchema = z.object({
  client_id: z.string().uuid('client_id must be a UUID'),
});

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!AI_FEATURES.CHURN_PREDICTION.enabled) {
    const body: AIResponse<ScoreOutput> = {
      success: false,
      error: { code: 'FEATURE_DISABLED', message: 'Churn prediction is currently disabled.', retryable: false },
    };
    return NextResponse.json(body, { status: 503 });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_JSON', message: 'invalid_json', retryable: false } },
        { status: 400 }
      );
    }

    let parsed;
    try {
      parsed = RescoreInputSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        const msg = firstZodMessage(error);
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_INPUT', message: msg, retryable: false } },
          { status: 400 }
        );
      }
      throw error;
    }

    // Resolve gym (preferred) or fall back to instructor-tenant path.
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_GYM', message: 'No gym found for this user.', retryable: false } },
        { status: 404 }
      );
    }
    const effectiveGymId = gymRes.data.id;

    const log = aiLogger(AI_FEATURES.CHURN_PREDICTION.id, effectiveGymId);
    log.start('none'); // v1 is non-LLM

    // Fetch live signals.
    const signalsResult = await fetchChurnSignals(parsed.client_id, effectiveGymId);
    if (!signalsResult) {
      // Either env is misconfigured or the client doesn't exist in this gym.
      log.failure('MEMBER_NOT_FOUND');
      return NextResponse.json(
        {
          success: false,
          error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found in this gym.', retryable: false },
        },
        { status: 404 }
      );
    }

    // < 14 days of history → auto-HEALTHY without scoring.
    if (!hasEnoughHistory(signalsResult.joinedAt)) {
      const data = newMemberDefault(parsed.client_id);
      await persistMemberScore(parsed.client_id, {
        churnRiskScore: data.churnRiskScore,
        healthStatus: data.healthStatus,
      });
      const meta = log.success({ inputTokens: 0, outputTokens: 0 });
      const body: AIResponse<ScoreOutput> = { success: true, data, meta };
      return NextResponse.json(body);
    }

    // Score + persist.
    const data = scoreMember({ memberId: parsed.client_id, signals: signalsResult.signals });
    const persistRes = await persistMemberScore(parsed.client_id, {
      churnRiskScore: data.churnRiskScore,
      healthStatus: data.healthStatus,
    });
    if (!persistRes.success) {
      // Score still returned even if persistence failed — the UI
      // can show the live result and we'll catch up on the next run.
      logError(new Error(persistRes.error ?? 'persist_failed'), {
        action: 'rescore_member.persist',
        clientId: parsed.client_id,
        gymId: effectiveGymId,
      });
    }

    const meta = log.success({ inputTokens: 0, outputTokens: 0 });
    const body: AIResponse<ScoreOutput> = { success: true, data, meta };
    return NextResponse.json(body);
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/ai/rescore-member' });
    const body: AIResponse<ScoreOutput> = {
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
