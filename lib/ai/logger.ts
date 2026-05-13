/**
 * lib/ai/logger.ts
 *
 * Thin wrapper around the agent_run_log table. Every AI feature
 * invocation should call aiLogger(feature, gymId).start(model), then
 * .success({ tokens }) or .failure(code) on completion. The writer
 * uses the Supabase service-role client so it works the same in
 * route handlers and in cron jobs.
 *
 * Ported from the sibling tribe-os codebase; adapted to use the
 * Supabase JS client + service-role pattern that tribe-v3 uses
 * across its other backend writes.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { calculateCost } from './config';
import { logError } from '@/lib/logger';
import type { AIResponseMeta } from './types';

interface AgentRunStart {
  start(model: string): void;
  success(tokens: { inputTokens: number; outputTokens: number; cachedTokens?: number }): AIResponseMeta;
  failure(errorCode: string): AIResponseMeta;
}

/**
 * Create a one-shot logger for a single AI feature invocation.
 *
 * Usage:
 *   const log = aiLogger('churn_prediction', gymId);
 *   log.start('none');                              // non-LLM features
 *   const meta = log.success({ inputTokens: 0, outputTokens: 0 });
 *   return { success: true, data: result, meta };
 *
 * The DB write fires inside .success() / .failure(). Writes happen
 * via the service-role key — set NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY in env. If those are missing the
 * function logs the failure but does NOT throw — observability
 * should never break a user-facing feature.
 */
export function aiLogger(feature: string, gymId: string): AgentRunStart {
  const startTime = Date.now();
  let model = 'none';

  function writeLog(params: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    success: boolean;
    errorCode?: string;
  }): AIResponseMeta {
    const durationMs = Date.now() - startTime;
    const costUsd = calculateCost(model, params.inputTokens, params.outputTokens, params.cachedTokens);
    const tokensUsed = params.inputTokens + params.outputTokens;

    // Best-effort persistence — never throws into the caller.
    void persistRunLog({
      gymId,
      feature,
      model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      cachedTokens: params.cachedTokens,
      costUsd,
      durationMs,
      success: params.success,
      errorCode: params.errorCode,
    });

    return {
      model,
      tokensUsed,
      cachedTokens: params.cachedTokens,
      costUsd,
      durationMs,
    };
  }

  return {
    start(m: string) {
      model = m;
    },
    success(tokens) {
      return writeLog({
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cachedTokens: tokens.cachedTokens ?? 0,
        success: true,
      });
    },
    failure(errorCode: string) {
      return writeLog({
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        success: false,
        errorCode,
      });
    },
  };
}

async function persistRunLog(row: {
  gymId: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  durationMs: number;
  success: boolean;
  errorCode?: string;
}): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      // Silently skip — observability should never break a feature.
      // The startup script logs the misconfiguration once at boot.
      return;
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await service.from('agent_run_log').insert({
      gym_id: row.gymId,
      feature: row.feature,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      cached_tokens: row.cachedTokens,
      cost_usd: row.costUsd,
      duration_ms: row.durationMs,
      success: row.success,
      error_code: row.errorCode ?? null,
    });
    if (error) {
      logError(error, { action: 'ai.run_log.insert', feature: row.feature, gymId: row.gymId });
    }
  } catch (error) {
    logError(error, { action: 'ai.run_log.exception', feature: row.feature, gymId: row.gymId });
  }
}
