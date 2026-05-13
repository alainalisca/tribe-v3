/**
 * lib/ai/data-access.ts
 *
 * Bridges the AI scoring engine to live tribe-v3 data.
 *
 * Single export today: `fetchChurnSignals(clientId, gymId)` — gathers
 * the seven raw signals the churn scorer needs from the clients,
 * client_attendance, training_partners, and payments tables.
 *
 * Adapted from the Prisma-based equivalent in the sibling tribe-os
 * codebase. tribe-v3 uses Supabase JS directly, so the queries here
 * shape the data without the Prisma ORM layer. RLS is bypassed by
 * the service-role client so cron jobs and route handlers can both
 * use this function with the same shape.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { ChurnSignals } from './types';

export interface ChurnSignalsResult {
  joinedAt: string;
  signals: ChurnSignals;
}

/**
 * Build a Supabase service-role client. Returns null when env vars
 * are missing so callers can fall back to demo data without crashing
 * (matches the sibling tribe-os fallback pattern).
 */
function buildServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Fetch the seven churn signals for a single client in a gym.
 *
 * Returns null when:
 *   - service-role env is missing
 *   - the client doesn't exist or doesn't belong to this gym
 *   - a query failed and we don't have enough to score
 *
 * The caller (the API route or batch job) can fall back to either
 * demo data or the newMemberDefault() if this returns null.
 */
export async function fetchChurnSignals(clientId: string, gymId: string): Promise<ChurnSignalsResult | null> {
  const service = buildServiceClient();
  if (!service) return null;

  try {
    // 1. Base client row (verify gym membership + grab joinedAt).
    const { data: clientRow, error: clientErr } = await service
      .from('clients')
      .select('id, gym_id, created_at, last_seen_at, sessions_last_30_days, current_streak_days')
      .eq('id', clientId)
      .eq('gym_id', gymId)
      .maybeSingle();
    if (clientErr) {
      logError(clientErr, { action: 'fetchChurnSignals.client_row', clientId, gymId });
      return null;
    }
    if (!clientRow) return null;

    // 2. Days since last attendance.
    const lastSeen = clientRow.last_seen_at ? new Date(clientRow.last_seen_at as string) : null;
    const daysSinceLastAttendance = lastSeen
      ? Math.max(0, Math.floor((Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)))
      : 9999;

    // 3. Attendance frequency delta.
    // Compute: (avg weekly attendance over last 90d) vs sessions
    // last 30d. The 90d window is approximated via total_sessions
    // on the row — we don't keep a true 90-day rolling counter yet,
    // so this normalizes against last_30 / 90d_avg.
    const sessions30 = (clientRow.sessions_last_30_days as number) ?? 0;
    // Heuristic baseline: an active member does ~3 sessions/week
    // = ~13/month. If sessions30 < baseline, treat the delta as
    // (baseline - sessions30) / baseline.
    const BASELINE_MONTHLY = 13;
    const attendanceFrequencyDelta =
      sessions30 >= BASELINE_MONTHLY ? 0 : Math.min(1, (BASELINE_MONTHLY - sessions30) / BASELINE_MONTHLY);

    // 4. Streak broken: were they on a streak that just ended?
    // Approximation: current_streak_days = 0 AND last_seen within
    // last 14 days = a recent break. Without snapshots we can't
    // know the prior streak length precisely; this is the v1 heuristic.
    const streakBroken =
      (clientRow.current_streak_days as number) === 0 && daysSinceLastAttendance <= 14 && daysSinceLastAttendance >= 3;

    // 5. Training partner count.
    const { count: partnerCount } = await service
      .from('training_partners')
      .select('id', { count: 'exact', head: true })
      .or(`member_a_id.eq.${clientId},member_b_id.eq.${clientId}`)
      .eq('gym_id', gymId);
    const trainingPartnerCount = partnerCount ?? 0;

    // 6. Payment failures in last 90 days.
    // tribe-v3's payment data lives on client_attendance rows
    // (paid + amount_paid_cents + payment_method). There's no
    // direct "payment failed" signal — for v1 we surface 0 here
    // and update once we wire a real payments table.
    // TODO(intelligence): plumb Stripe webhook failures into a
    // payments table and wire this up.
    const paymentFailures90d = 0;

    // 7. Cancellation rate in last 30 days.
    // tribe-v3 doesn't currently track cancellations on attendance
    // rows. v1 returns 0; revisit when we add cancellation tracking.
    const cancellationRate30d = 0;

    // 8. Community engagement drop.
    // Cross-app signal from the consumer Tribe app (posts/comments).
    // Not wired yet. v1 returns 0.
    const communityEngagementDrop = 0;

    return {
      joinedAt: clientRow.created_at as string,
      signals: {
        daysSinceLastAttendance,
        attendanceFrequencyDelta,
        streakBroken,
        trainingPartnerCount,
        paymentFailures90d,
        cancellationRate30d,
        communityEngagementDrop,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchChurnSignals.exception', clientId, gymId });
    return null;
  }
}

/**
 * Persist a scoring result back onto the clients table. The route
 * handler / cron job calls this after scoreMember() to update the
 * cached churn_risk_score, churn_risk_updated_at, and health_status
 * columns. Service-role only.
 */
export async function persistMemberScore(
  clientId: string,
  score: { churnRiskScore: number; healthStatus: 'HEALTHY' | 'WATCH' | 'AT_RISK' }
): Promise<{ success: boolean; error?: string }> {
  const service = buildServiceClient();
  if (!service) return { success: false, error: 'service_role_missing' };

  try {
    const { error } = await service
      .from('clients')
      .update({
        churn_risk_score: score.churnRiskScore,
        churn_risk_updated_at: new Date().toISOString(),
        health_status: score.healthStatus,
      })
      .eq('id', clientId);
    if (error) {
      logError(error, { action: 'persistMemberScore', clientId });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    logError(error, { action: 'persistMemberScore.exception', clientId });
    return { success: false, error: 'exception' };
  }
}
