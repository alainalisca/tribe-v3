/**
 * lib/ai/churn-scoring.ts
 *
 * Feature 1.1 — Smart Churn Prediction Engine.
 *
 * Pure scoring logic: no LLM calls, no database access. Takes signals
 * in, returns a churn-risk score (0.0–1.0) and a HEALTHY/WATCH/
 * AT_RISK label.
 *
 * Ported verbatim from the sibling tribe-os codebase. See
 * lib/ai/config.ts for the weight calibration + thresholds and
 * AGENTIC_FEATURES_STRATEGY.md for the full Tier 1 spec.
 *
 * Scoring model (v1 — weighted linear heuristic):
 *   Each signal is normalized to 0–1, multiplied by its weight, and
 *   summed. Total weight = 1.0 so the final score is always in
 *   [0.0, 1.0].
 */

import { CHURN_WEIGHTS, HEALTH_THRESHOLDS, MIN_HISTORY_DAYS } from './config';
import type { ChurnSignals, HealthStatus, ScoreInput, ScoreOutput } from './types';
import { log } from '@/lib/logger';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalize each raw signal into a 0–1 risk contribution where
 * 0 = no risk and 1 = maximum risk from this signal.
 */
function normalizeSignals(signals: ChurnSignals): Record<string, number> {
  return {
    daysSinceLastAttendance: clamp(signals.daysSinceLastAttendance / 14, 0, 1),
    attendanceFrequencyDelta: clamp(signals.attendanceFrequencyDelta, 0, 1),
    streakBroken: signals.streakBroken ? 1 : 0,
    communityGraphIsolation: signals.trainingPartnerCount === 0 ? 1 : signals.trainingPartnerCount === 1 ? 0.5 : 0,
    paymentFailures: clamp(signals.paymentFailures90d / 2, 0, 1),
    cancellationRate: clamp(signals.cancellationRate30d, 0, 1),
    communityEngagementDrop: clamp(signals.communityEngagementDrop, 0, 1),
  };
}

function scoreToHealthStatus(score: number): HealthStatus {
  if (score < HEALTH_THRESHOLDS.HEALTHY_MAX) return 'HEALTHY';
  if (score < HEALTH_THRESHOLDS.WATCH_MAX) return 'WATCH';
  return 'AT_RISK';
}

/**
 * Score a single member's churn risk.
 *
 * Missing signals: if a value is NaN or undefined, the scorer uses
 * a neutral 0.5 default so the member isn't unfairly penalized
 * or given a free pass — and emits a warning to the logger.
 */
export function scoreMember(input: ScoreInput): ScoreOutput {
  const normalized = normalizeSignals(input.signals);

  const weightMap: Record<string, number> = {
    daysSinceLastAttendance: CHURN_WEIGHTS.daysSinceLastAttendance,
    attendanceFrequencyDelta: CHURN_WEIGHTS.attendanceFrequencyDelta,
    streakBroken: CHURN_WEIGHTS.streakBroken,
    communityGraphIsolation: CHURN_WEIGHTS.communityGraphIsolation,
    paymentFailures: CHURN_WEIGHTS.paymentFailures,
    cancellationRate: CHURN_WEIGHTS.cancellationRate,
    communityEngagementDrop: CHURN_WEIGHTS.communityEngagementDrop,
  };

  const breakdown: Record<string, number> = {};
  let totalScore = 0;

  for (const [signal, weight] of Object.entries(weightMap)) {
    let value = normalized[signal];
    if (value === undefined || Number.isNaN(value)) {
      value = 0.5;
      log('warn', `Missing churn signal "${signal}" — using neutral default`, {
        action: 'churn_scoring.missing_signal',
        memberId: input.memberId,
        signal,
      });
    }
    const contribution = value * weight;
    breakdown[signal] = Math.round(contribution * 1000) / 1000;
    totalScore += contribution;
  }

  const churnRiskScore = Math.round(totalScore * 1000) / 1000;

  return {
    memberId: input.memberId,
    churnRiskScore,
    healthStatus: scoreToHealthStatus(churnRiskScore),
    signalBreakdown: breakdown,
  };
}

/**
 * Does this member have enough history to be meaningfully scored?
 * Returns true when joined ≥ MIN_HISTORY_DAYS ago.
 */
export function hasEnoughHistory(joinedAt: string | Date): boolean {
  const joined = typeof joinedAt === 'string' ? new Date(joinedAt) : joinedAt;
  const days = (Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24);
  return days >= MIN_HISTORY_DAYS;
}

/** Default "new member" score for callers gated by hasEnoughHistory. */
export function newMemberDefault(memberId: string): ScoreOutput {
  return {
    memberId,
    churnRiskScore: 0,
    healthStatus: 'HEALTHY',
    signalBreakdown: {
      daysSinceLastAttendance: 0,
      attendanceFrequencyDelta: 0,
      streakBroken: 0,
      communityGraphIsolation: 0,
      paymentFailures: 0,
      cancellationRate: 0,
      communityEngagementDrop: 0,
    },
  };
}
