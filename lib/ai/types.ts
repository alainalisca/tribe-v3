/**
 * lib/ai/types.ts
 *
 * Shared types for the Tribe.OS AI infrastructure.
 * Mirrors the sibling tribe-os codebase so call sites are portable.
 */

export type HealthStatus = 'HEALTHY' | 'WATCH' | 'AT_RISK';

/**
 * Raw signals fed into the churn-scoring model. All values are
 * computed from the database; any unavailable signal can be left
 * undefined / NaN — the scorer falls back to a neutral default.
 */
export interface ChurnSignals {
  /** Days since the member last attended a session. */
  daysSinceLastAttendance: number;
  /**
   * Delta in attendance frequency (0–1 where 1 = "stopped completely").
   * Computed as: (avg_sessions_per_week_last_90d - sessions_this_week) /
   * avg_sessions_per_week_last_90d, clamped.
   */
  attendanceFrequencyDelta: number;
  /** Was the member on a streak that just broke? */
  streakBroken: boolean;
  /**
   * Count of distinct training partners (clients they've attended
   * the same session with). 0 = isolated, 3+ = well-connected.
   */
  trainingPartnerCount: number;
  /** Number of failed payments in the last 90 days. */
  paymentFailures90d: number;
  /** Booking cancellation rate in the last 30 days (0–1). */
  cancellationRate30d: number;
  /** Drop in community-app engagement (posts/comments) — 0 to 1. */
  communityEngagementDrop: number;
}

export interface ScoreInput {
  memberId: string;
  signals: ChurnSignals;
}

export interface ScoreOutput {
  memberId: string;
  /** 0.0–1.0 churn risk. */
  churnRiskScore: number;
  /** Health status derived from the score. */
  healthStatus: HealthStatus;
  /** Per-signal contribution to the score (for UI breakdowns). */
  signalBreakdown: Record<string, number>;
}

export interface AIResponseMeta {
  model: string;
  tokensUsed: number;
  cachedTokens: number;
  costUsd: number;
  durationMs: number;
}

export type AIResponse<T> =
  | { success: true; data: T; meta?: AIResponseMeta }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
    };
