/**
 * lib/ai/config.ts
 *
 * Central configuration for all Tribe.OS AI features.
 * Model selection, pricing, rate limits, feature flags, and the
 * churn-scoring weights + thresholds.
 *
 * Ported from the sibling tribe-os codebase verbatim — these are
 * the canonical values per the Tribe AGENTIC_FEATURES_STRATEGY.md.
 *
 * MODELS:
 * - claude-haiku-4-5:  Structured/analytical work (scoring, JSON gen, classification)
 * - claude-sonnet-4-6: Member-facing content (messages, personalized copy)
 *
 * PRICING (as of April 2026, per 1M tokens, USD):
 * - Haiku:  $0.80 input / $4.00 output / cache read 90% off
 * - Sonnet: $3.00 input / $15.00 output / cache read 90% off
 */

// ── MODEL CONFIGURATION ─────────────────────────────────────────────

export const AI_MODELS = {
  /** For structured/analytical work: scoring, JSON gen, classification */
  ANALYTICAL: 'claude-haiku-4-5-20251001' as const,
  /** For member-facing content: messages, personalized copy */
  CONTENT: 'claude-sonnet-4-6' as const,
} as const;

export type AIModelId = (typeof AI_MODELS)[keyof typeof AI_MODELS];

// ── PRICING ─────────────────────────────────────────────────────────

export const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  [AI_MODELS.ANALYTICAL]: {
    input: 0.8,
    output: 4.0,
    cacheRead: 0.08, // 90% discount vs input
  },
  [AI_MODELS.CONTENT]: {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3, // 90% discount vs input
  },
};

/**
 * Calculate cost in USD for a given (model, input, output, cached) usage.
 * Returns a floating-point figure rounded to 6 decimals.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const effectiveInput = Math.max(0, inputTokens - cachedTokens);
  const cost =
    (effectiveInput / 1_000_000) * pricing.input +
    (cachedTokens / 1_000_000) * pricing.cacheRead +
    (outputTokens / 1_000_000) * pricing.output;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

// ── RATE LIMITING ───────────────────────────────────────────────────

/**
 * Default per-gym token budgets by plan tier. The current Tribe.OS
 * SKU is a flat $30/mo "premium" without sub-tiers; once we ship
 * STARTER / PRO / ORGANIZER / ENTERPRISE these limits map onto them.
 *
 * For now the only active limit is PRO — every gym on Tribe.OS
 * premium gets the PRO budget.
 */
export const RATE_LIMITS = {
  STARTER: { dailyTokens: 100_000, monthlyTokens: 2_000_000 },
  PRO: { dailyTokens: 500_000, monthlyTokens: 10_000_000 },
  ORGANIZER: { dailyTokens: 2_000_000, monthlyTokens: 50_000_000 },
  ENTERPRISE: { dailyTokens: 10_000_000, monthlyTokens: 200_000_000 },
} as const;

// ── FEATURE FLAGS ───────────────────────────────────────────────────

export const AI_FEATURES = {
  CHURN_PREDICTION: {
    id: 'churn_prediction',
    name: 'Churn Prediction Engine',
    version: '1.1',
    enabled: true,
    minPlan: 'PRO' as const,
  },
  MESSAGE_DRAFTER: {
    id: 'message_drafter',
    name: 'AI Message Drafter',
    version: '1.2',
    enabled: false, // not yet wired in tribe-v3 — LLM key + budget gate pending
    minPlan: 'PRO' as const,
  },
  WORKOUT_GENERATOR: {
    id: 'workout_generator',
    name: 'Workout Generator',
    version: '1.3',
    enabled: false,
    minPlan: 'PRO' as const,
  },
  REVENUE_FORECAST: {
    id: 'revenue_forecast',
    name: 'Revenue Forecasting',
    version: '1.4',
    enabled: false,
    minPlan: 'PRO' as const,
  },
  SMART_SCHEDULING: {
    id: 'smart_scheduling',
    name: 'Smart Session Scheduling',
    version: '1.5',
    enabled: false,
    minPlan: 'ORGANIZER' as const,
  },
} as const;

// ── CHURN SCORING WEIGHTS ───────────────────────────────────────────

/**
 * v1 heuristic weights for churn prediction. Total = 1.0.
 * Each signal contributes weight × normalized_value (0–1).
 *
 * Calibrated from industry research + tribe-os strategy doc. Tune
 * after 50+ labeled churn events let us fit a logistic regression.
 */
export const CHURN_WEIGHTS = {
  daysSinceLastAttendance: 0.25,
  attendanceFrequencyDelta: 0.2,
  streakBroken: 0.15,
  communityGraphIsolation: 0.15,
  paymentFailures: 0.1,
  cancellationRate: 0.08,
  communityEngagementDrop: 0.07,
} as const;

/**
 * Health status thresholds.
 *   score < 0.3       → HEALTHY
 *   0.3 ≤ score < 0.6 → WATCH
 *   score ≥ 0.6       → AT_RISK
 */
export const HEALTH_THRESHOLDS = {
  HEALTHY_MAX: 0.3,
  WATCH_MAX: 0.6,
} as const;

/** Members with fewer than this many days of history get auto-HEALTHY. */
export const MIN_HISTORY_DAYS = 14;
