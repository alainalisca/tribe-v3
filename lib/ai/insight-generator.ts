/**
 * lib/ai/insight-generator.ts
 *
 * Translates scored members into community_insight rows.
 *
 * Tier-1 v1 rule (heuristic, not LLM): for every member whose
 * fresh churn_risk_score crosses the AT_RISK threshold (≥ 0.6), we
 * generate a single CHURN_RISK insight with HIGH severity. The
 * insight references that member, carries the score in
 * data_payload for auditability, and offers a SEND_MESSAGE action.
 *
 * Future iterations (deferred to Phase D round 2):
 *   - RETENTION_OPP cards when an AT_RISK member's training
 *     partner is still HEALTHY (intervention path: nudge the
 *     healthy one to bring them back).
 *   - REVENUE cards when failed payments accumulate.
 *   - GROWTH cards when waitlists pile up.
 *
 * Insights expire after 14 days by default — the nightly job will
 * regenerate fresh ones for members still scoring high. We also
 * dedupe by checking for an open (unactioned + unexpired)
 * CHURN_RISK insight already referencing the same member.
 *
 * This module is service-role only — it writes to community_insights
 * which has no INSERT policy for the authenticated role.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { ScoreOutput } from './types';

const INSIGHT_EXPIRY_DAYS = 14;

interface MemberLite {
  id: string;
  name: string;
  gym_id: string;
}

interface GenerateResult {
  insights_created: number;
  insights_skipped_duplicate: number;
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
 * Generate CHURN_RISK insights for a batch of scored members.
 * Skips members whose health_status came back HEALTHY or WATCH.
 * Dedupes against any open insight already referencing the same
 * member.
 */
export async function generateChurnInsights(
  gymId: string,
  scoredMembers: Array<{ score: ScoreOutput; member: MemberLite }>
): Promise<GenerateResult> {
  const service = buildServiceClient();
  if (!service) return { insights_created: 0, insights_skipped_duplicate: 0 };

  const atRisk = scoredMembers.filter((s) => s.score.healthStatus === 'AT_RISK');
  if (atRisk.length === 0) {
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Dedupe step: pull every open CHURN_RISK insight for this gym
  // and the set of member_ids each one references.
  const { data: openInsights, error: openErr } = await service
    .from('community_insights')
    .select('id, members:community_insight_members(client_id)')
    .eq('gym_id', gymId)
    .eq('type', 'CHURN_RISK')
    .eq('is_actioned', false)
    .gt('expires_at', new Date().toISOString());
  if (openErr) {
    logError(openErr, { action: 'generateChurnInsights.dedupe', gymId });
  }
  const alreadyCovered = new Set<string>();
  for (const row of openInsights ?? []) {
    const memberLinks = (row.members as unknown as Array<{ client_id: string }> | null) ?? [];
    for (const m of memberLinks) alreadyCovered.add(m.client_id);
  }

  let created = 0;
  let skipped = 0;
  const now = new Date();
  const expires = new Date(now.getTime() + INSIGHT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // One insight per at-risk member. Each gets a HIGH-severity
  // CHURN_RISK card with the member name in the headline and the
  // score breakdown stashed in data_payload.
  for (const { score, member } of atRisk) {
    if (alreadyCovered.has(member.id)) {
      skipped += 1;
      continue;
    }

    const headline = `${member.name} is at risk of churning`;
    const body = buildBody(score);

    const insertRes = await service
      .from('community_insights')
      .insert({
        gym_id: gymId,
        type: 'CHURN_RISK',
        severity: score.churnRiskScore >= 0.8 ? 'CRITICAL' : 'HIGH',
        is_actioned: false,
        headline,
        body,
        action_label: 'Reach out',
        action_type: 'SEND_MESSAGE',
        data_payload: {
          score: score.churnRiskScore,
          health_status: score.healthStatus,
          signal_breakdown: score.signalBreakdown,
        },
        predicted_revenue_cents: null,
        confidence_score: 0.7,
        expires_at: expires.toISOString(),
      })
      .select('id')
      .single();
    if (insertRes.error || !insertRes.data) {
      logError(insertRes.error ?? new Error('insert returned no row'), {
        action: 'generateChurnInsights.insert',
        gymId,
        memberId: member.id,
      });
      continue;
    }

    // Link the member.
    const linkRes = await service
      .from('community_insight_members')
      .insert({ insight_id: insertRes.data.id, client_id: member.id });
    if (linkRes.error) {
      logError(linkRes.error, {
        action: 'generateChurnInsights.link',
        gymId,
        memberId: member.id,
        insightId: insertRes.data.id,
      });
    }
    created += 1;
  }

  return { insights_created: created, insights_skipped_duplicate: skipped };
}

/**
 * Build the body copy from the score breakdown. Picks the top
 * contributing signal to give the coach context for the alert.
 */
function buildBody(score: ScoreOutput): string {
  const entries = Object.entries(score.signalBreakdown);
  if (entries.length === 0) {
    return `Churn risk crossed the threshold (score ${score.churnRiskScore.toFixed(2)}). Reach out to keep them engaged.`;
  }
  // Find the largest signal contribution.
  entries.sort((a, b) => b[1] - a[1]);
  const [topSignal, topValue] = entries[0];
  const topLabel = SIGNAL_HEADLINE[topSignal] ?? topSignal;
  return `Score ${score.churnRiskScore.toFixed(2)}. Largest driver: ${topLabel} (${topValue.toFixed(2)} of the total). A short check-in message often pulls them back.`;
}

const SIGNAL_HEADLINE: Record<string, string> = {
  daysSinceLastAttendance: 'days since their last visit',
  attendanceFrequencyDelta: 'attendance dropping off',
  streakBroken: 'a streak that just broke',
  communityGraphIsolation: 'no training partners',
  paymentFailures: 'failed payments',
  cancellationRate: 'a high cancellation rate',
  communityEngagementDrop: 'a drop in community engagement',
};
