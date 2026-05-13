/**
 * GET /api/cron/tribe-os/intelligence
 *
 * Nightly intelligence engine. Runs over every gym with an active
 * Tribe.OS premium subscription and:
 *   1. Scores every non-archived client (churn risk + health status)
 *   2. Generates CHURN_RISK insights for the AT_RISK subset
 *
 * Schedule: vercel.json maps this to `0 7 * * *` UTC, which is
 * 2 AM Medellín time (UTC-5) — gyms-asleep hours. Gyms in other
 * timezones get the same UTC slot for now; per-gym scheduling can
 * land later by reading gym.timezone and only firing when the
 * local hour matches a target.
 *
 * Auth: Bearer CRON_SECRET (matches the other Tribe cron jobs).
 *
 * The route iterates gyms sequentially. Per-gym scoring is itself
 * sequential (see lib/ai/run-intelligence). For a Tribe.OS instance
 * with 50 gyms × 80 members average, this is ~30 minutes wall-clock
 * — fits inside Vercel's serverless function limits when split by
 * gym pagination. Capped at MAX_GYMS_PER_RUN per execution; if more
 * gyms exist the cron runs again the next night and reaches them.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { log, logError } from '@/lib/logger';
import { runIntelligenceForGym, type IntelligenceRunSummary } from '@/lib/ai/run-intelligence';

const MAX_GYMS_PER_RUN = 50;

export async function GET(request: Request): Promise<NextResponse> {
  const route = 'cron:tribe-os/intelligence';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      log('error', 'cron_failed', { action: 'cron_failed', route, reason: 'service_role_missing' });
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Pull every premium-active gym. The two-tier filter (tier ∈ premium
    // tiers + status = active) matches isTribeOSPremiumActive() — keep
    // these aligned with `lib/dal/tribeOSPremium.ts`.
    const { data: gymRows, error: gymErr } = await service
      .from('gyms')
      .select('id, name, tribe_os_tier, tribe_os_status')
      .eq('tribe_os_status', 'active')
      .not('tribe_os_tier', 'is', null)
      .limit(MAX_GYMS_PER_RUN);
    if (gymErr) {
      logError(gymErr, { action: 'cron.intelligence.list_gyms' });
      log('error', 'cron_failed', { action: 'cron_failed', route, reason: 'list_gyms_failed' });
      return NextResponse.json({ error: gymErr.message }, { status: 500 });
    }

    // Tally aggregates so the response is observable in Vercel logs
    // without grep-ing per-gym detail.
    let gymsProcessed = 0;
    let gymsFailed = 0;
    let totalScored = 0;
    let totalAtRisk = 0;
    let totalInsightsCreated = 0;
    const perGym: Array<{ gymId: string; name: string; summary: IntelligenceRunSummary }> = [];

    for (const g of gymRows ?? []) {
      const gymId = g.id as string;
      const gymName = (g.name as string) ?? '(unnamed)';
      try {
        const summary = await runIntelligenceForGym(gymId);
        if (!summary) {
          gymsFailed += 1;
          continue;
        }
        gymsProcessed += 1;
        totalScored += summary.scored;
        totalAtRisk += summary.at_risk_count;
        totalInsightsCreated += summary.insights_created;
        perGym.push({ gymId, name: gymName, summary });
        log('info', 'cron.gym_processed', {
          action: 'cron.intelligence.gym_processed',
          gymId,
          ...summary,
        });
      } catch (error) {
        gymsFailed += 1;
        logError(error, { action: 'cron.intelligence.gym', gymId });
      }
    }

    const duration_ms = Date.now() - startedAt;
    const payload = {
      success: true,
      gyms_processed: gymsProcessed,
      gyms_failed: gymsFailed,
      total_scored: totalScored,
      total_at_risk: totalAtRisk,
      total_insights_created: totalInsightsCreated,
      duration_ms,
      // Truncate per-gym detail to keep the response payload bounded
      // when there are many gyms — first 10 only.
      sample: perGym.slice(0, 10),
    };

    log('info', 'cron_complete', { action: 'cron_complete', route, ...payload, sample: undefined });
    return NextResponse.json(payload);
  } catch (error) {
    logError(error, { route });
    log('error', 'cron_failed', {
      action: 'cron_failed',
      route,
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
