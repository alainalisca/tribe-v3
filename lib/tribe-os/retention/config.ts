export const RETENTION_THRESHOLDS = {
  high_days_inactive: 14,
  medium_days_inactive: 7,
  trend_drop_severe: 0.4,
  trend_drop_moderate: 0.7,
  plan_expiry_urgent_days: 7,
  plan_expiry_warning_days: 14,
  new_member_days: 30,
  min_baseline_visits: 3,
  baseline_weeks: 8,
  recent_weeks: 2,
} as const;

export type RetentionLevel = 'high' | 'medium' | 'low' | 'new' | 'insufficient_data';

export interface RetentionSignals {
  days_since_last_activity: number | null;
  last_activity_at: string | null;
  visits_last_14d: number;
  visits_last_28d: number;
  baseline_weekly_rate: number;
  trend_ratio: number | null;
  plan_ends_in_days: number | null;
  is_new: boolean;
}

export interface RetentionResult {
  client_id: string;
  gym_id: string;
  score: number;
  level: RetentionLevel;
  reasons: string[];
  signals: RetentionSignals;
}
