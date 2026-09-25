import { RETENTION_THRESHOLDS as T, type RetentionLevel, type RetentionSignals, type RetentionResult } from './config';

interface ActivityRow {
  activity_at: string;
}

interface MemberInput {
  client_id: string;
  gym_id: string;
  joined_on: string | null;
  plan_ends_on: string | null;
  activities: ActivityRow[];
  now?: Date;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function countInRange(dates: Date[], from: Date, to: Date): number {
  return dates.filter((d) => d >= from && d < to).length;
}

export function computeSignals(input: MemberInput): RetentionSignals {
  const now = input.now ?? new Date();
  const activities = input.activities.map((a) => new Date(a.activity_at)).sort((a, b) => b.getTime() - a.getTime());

  const days_since_last_activity = activities.length > 0 ? daysBetween(now, activities[0]) : null;

  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 14);
  const d28 = new Date(now);
  d28.setDate(d28.getDate() - 28);

  const visits_last_14d = countInRange(activities, d14, now);
  const visits_last_28d = countInRange(activities, d28, now);

  const recentEnd = new Date(now);
  recentEnd.setDate(recentEnd.getDate() - T.recent_weeks * 7);
  const baselineEnd = new Date(recentEnd);
  baselineEnd.setDate(baselineEnd.getDate() - T.baseline_weeks * 7);

  const baselineVisits = countInRange(activities, baselineEnd, recentEnd);
  const baseline_weekly_rate = baselineVisits / T.baseline_weeks;

  let trend_ratio: number | null = null;
  if (baseline_weekly_rate >= T.min_baseline_visits / T.baseline_weeks) {
    const recentRate = countInRange(activities, recentEnd, now) / T.recent_weeks;
    trend_ratio = recentRate / baseline_weekly_rate;
  }

  let plan_ends_in_days: number | null = null;
  if (input.plan_ends_on) {
    plan_ends_in_days = daysBetween(new Date(input.plan_ends_on), now);
  }

  const is_new = input.joined_on ? daysBetween(now, new Date(input.joined_on)) <= T.new_member_days : false;

  return {
    days_since_last_activity,
    visits_last_14d,
    visits_last_28d,
    baseline_weekly_rate,
    trend_ratio,
    plan_ends_in_days,
    is_new,
  };
}

function daysAbsentReason(d: number): string {
  return d === 1 ? '1 día sin venir / 1 day absent' : `${d} días sin venir / ${d} days absent`;
}

function planExpiryReason(d: number): string {
  if (d === 0) return 'Su plan vence hoy / Plan expires today';
  if (d === 1) return 'Su plan vence mañana / Plan expires tomorrow';
  return `Su plan vence en ${d} días / Plan expires in ${d} days`;
}

export function scoreRetention(input: MemberInput): RetentionResult {
  const signals = computeSignals(input);
  const reasons: string[] = [];
  let score = 0;

  if (signals.is_new) {
    const recentlyActive = signals.days_since_last_activity !== null && signals.days_since_last_activity <= 7;
    if (recentlyActive) {
      return {
        client_id: input.client_id,
        gym_id: input.gym_id,
        score: 0,
        level: 'new',
        reasons: ['Miembro nuevo / New member'],
        signals,
      };
    }
    if (signals.days_since_last_activity !== null) {
      const d = signals.days_since_last_activity;
      reasons.push(
        d === 1
          ? 'Nuevo y lleva 1 día sin venir / New and 1 day absent'
          : `Nuevo y lleva ${d} días sin venir / New and ${d} days absent`
      );
      score += 0.4;
    } else {
      reasons.push('Nuevo, sin actividad registrada / New, no recorded activity');
      score += 0.2;
    }
  }

  if (signals.days_since_last_activity === null) {
    return {
      client_id: input.client_id,
      gym_id: input.gym_id,
      score: 0,
      level: 'insufficient_data',
      reasons: ['Sin actividad registrada / No recorded activity'],
      signals,
    };
  }

  if (!signals.is_new) {
    if (signals.days_since_last_activity >= T.high_days_inactive) {
      score += 0.4;
      reasons.push(daysAbsentReason(signals.days_since_last_activity));
    } else if (signals.days_since_last_activity >= T.medium_days_inactive) {
      score += 0.2;
      reasons.push(daysAbsentReason(signals.days_since_last_activity));
    }
  }

  if (signals.trend_ratio !== null && signals.trend_ratio <= T.trend_drop_severe) {
    const pct = Math.round((1 - signals.trend_ratio) * 100);
    score += 0.3;
    reasons.push(`Viene ${pct}% menos que su promedio / Visiting ${pct}% less than average`);
  } else if (signals.trend_ratio !== null && signals.trend_ratio <= T.trend_drop_moderate) {
    const pct = Math.round((1 - signals.trend_ratio) * 100);
    score += 0.15;
    reasons.push(`Viene ${pct}% menos que su promedio / Visiting ${pct}% less than average`);
  }

  if (signals.plan_ends_in_days !== null && signals.plan_ends_in_days < 0 && signals.plan_ends_in_days >= -30) {
    const ago = Math.abs(signals.plan_ends_in_days);
    score += 0.3;
    reasons.push(
      ago === 1
        ? 'Su plan venció hace 1 día / Plan expired 1 day ago'
        : `Su plan venció hace ${ago} días / Plan expired ${ago} days ago`
    );
  } else if (
    signals.plan_ends_in_days !== null &&
    signals.plan_ends_in_days >= 0 &&
    signals.plan_ends_in_days <= T.plan_expiry_urgent_days
  ) {
    score += 0.2;
    reasons.push(planExpiryReason(signals.plan_ends_in_days));
  } else if (
    signals.plan_ends_in_days !== null &&
    signals.plan_ends_in_days >= 0 &&
    signals.plan_ends_in_days <= T.plan_expiry_warning_days
  ) {
    score += 0.1;
    reasons.push(planExpiryReason(signals.plan_ends_in_days));
  }

  const hasAbsenceReason = reasons.some((r) => r.includes('días sin venir') || r.includes('days absent'));
  if (signals.visits_last_14d === 0 && signals.visits_last_28d > 0) {
    if (!hasAbsenceReason) {
      score += 0.1;
      reasons.push('Sin visitas en 14 días pero activo en 28 / No visits in 14d but active in 28d');
    }
  }

  score = Math.min(Math.round(score * 1000) / 1000, 1);

  let level: RetentionLevel;
  if (score >= 0.5) level = 'high';
  else if (score >= 0.25) level = 'medium';
  else level = 'low';

  if (reasons.length === 0) {
    reasons.push('Asistencia estable / Stable attendance');
  }

  return {
    client_id: input.client_id,
    gym_id: input.gym_id,
    score,
    level,
    reasons,
    signals,
  };
}
