/**
 * lib/ai/run-intelligence.ts
 *
 * Shared pipeline: score every non-archived client in a gym, persist
 * their churn_risk_score + health_status, then generate CHURN_RISK
 * insights for the AT_RISK subset.
 *
 * Called from:
 *   - POST /api/tribe-os/ai/rescore-all (user-triggered button)
 *   - /api/cron/tribe-os/intelligence (nightly, iterates gyms)
 *
 * Pure compute — no LLM. ~250-400ms per member. The function is
 * service-role only; the caller is responsible for authorization.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { scoreMember, hasEnoughHistory, newMemberDefault } from './churn-scoring';
import { fetchChurnSignals, persistMemberScore } from './data-access';
import { generateChurnInsights } from './insight-generator';
import type { ScoreOutput } from './types';

const DEFAULT_MAX_MEMBERS = 500;

export interface IntelligenceRunSummary {
  scored: number;
  skipped_new_member: number;
  at_risk_count: number;
  insights_created: number;
  insights_skipped_duplicate: number;
  duration_ms: number;
  errored: number;
}

export interface RunIntelligenceOptions {
  /** Cap the per-gym roster scan. Default 500. */
  maxMembers?: number;
}

function buildServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Score every non-archived client in a gym + generate insights.
 * Returns null when service-role env is missing.
 */
export async function runIntelligenceForGym(
  gymId: string,
  options: RunIntelligenceOptions = {}
): Promise<IntelligenceRunSummary | null> {
  const service = buildServiceClient();
  if (!service) return null;

  const maxMembers = options.maxMembers ?? DEFAULT_MAX_MEMBERS;
  const startTime = Date.now();

  const { data: clientRows, error: clientsErr } = await service
    .from('clients')
    .select('id, name, gym_id')
    .eq('gym_id', gymId)
    .eq('archived', false)
    .limit(maxMembers);
  if (clientsErr) {
    logError(clientsErr, { action: 'runIntelligenceForGym.list_clients', gymId });
    return null;
  }

  const scoredMembers: Array<{ score: ScoreOutput; member: { id: string; name: string; gym_id: string } }> = [];
  let scored = 0;
  let skippedNewMember = 0;
  let atRiskCount = 0;
  let errored = 0;

  // Sequential scoring keeps us inside Supabase rate limits + makes
  // observability easier. ~30s for 100 members, predictable.
  for (const c of clientRows ?? []) {
    const member = { id: c.id as string, name: c.name as string, gym_id: c.gym_id as string };
    try {
      const signals = await fetchChurnSignals(member.id, gymId);
      if (!signals) {
        errored += 1;
        continue;
      }
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
    } catch (error) {
      errored += 1;
      logError(error, { action: 'runIntelligenceForGym.member', gymId, memberId: member.id });
    }
  }

  const insightSummary = await generateChurnInsights(gymId, scoredMembers);

  return {
    scored,
    skipped_new_member: skippedNewMember,
    at_risk_count: atRiskCount,
    insights_created: insightSummary.insights_created,
    insights_skipped_duplicate: insightSummary.insights_skipped_duplicate,
    duration_ms: Date.now() - startTime,
    errored,
  };
}
