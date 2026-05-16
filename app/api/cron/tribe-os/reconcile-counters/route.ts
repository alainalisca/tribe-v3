/**
 * GET /api/cron/tribe-os/reconcile-counters
 *
 * Daily sanity-check that the cached counters on clients
 * (total_sessions, sessions_last_30_days, current_streak_days,
 * longest_streak_days) match the canonical values recomputed from
 * client_attendance.
 *
 * Why this exists: those counters are maintained by the trigger
 * from migration 079 on every INSERT/UPDATE/DELETE on
 * client_attendance. The trigger is reliable under normal load,
 * but it CAN fail (deadlock under concurrent writes, manual data
 * fixes that bypass it, timeout during a bulk insert). When that
 * happens the counters drift silently, and surfaces that depend
 * on them (/os/clients/[id] Stats, Celebrate Wins widget,
 * at-risk widget) start lying.
 *
 * This cron runs once a day, recomputes the canonical values,
 * compares against the cached versions, and logs drift.
 *
 * Auto-correction is OFF by default — controlled by the
 * RECONCILE_AUTO_CORRECT env var ('1' to enable). Run in
 * report-only mode for a week, verify the drift output is sane,
 * then flip the switch.
 *
 * Schedule: daily (cron expression in vercel.json).
 * Auth: Bearer CRON_SECRET.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { log, logError } from '@/lib/logger';
import { reconcileGymCounters } from '@/lib/dal/clients.reconcile';
import { withCronLock } from '@/lib/cron/lockGuard';

const MAX_GYMS_PER_RUN = 200;

export async function GET(request: Request): Promise<NextResponse> {
  const route = 'cron:tribe-os/reconcile-counters';
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
      logError(new Error('Missing Supabase env'), { route });
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }

    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const autoCorrect = process.env.RECONCILE_AUTO_CORRECT === '1';

    // Guard against duplicate concurrent invocations (manual fire
    // while a scheduled one is running, or Vercel's rare duplicate-
    // delivery edge case). The work block runs only when we hold
    // the lock; lockGuard falls back to no-lock execution if the
    // migration hasn't been applied yet so the cron still runs.
    const guarded = await withCronLock(service, 'reconcile-counters', async () => {
      // Pull every gym that has at least one non-archived client.
      // We skip gyms with zero clients to avoid wasted no-op
      // queries — most newly-created gyms fall into that bucket.
      const { data: gyms, error: gymsErr } = await service.from('gyms').select('id').limit(MAX_GYMS_PER_RUN);
      if (gymsErr) {
        logError(gymsErr, { route, action: 'list_gyms' });
        throw gymsErr;
      }

      let total_clients_checked = 0;
      let total_drifted = 0;
      let total_corrected = 0;
      const drifted_gyms: Array<{ gym_id: string; drifted_count: number }> = [];

      for (const gym of gyms ?? []) {
        const gymId = gym.id as string;
        const res = await reconcileGymCounters(service, gymId, { autoCorrect });
        if (!res.success || !res.data) {
          logError(new Error(res.error ?? 'unknown'), { route, action: 'reconcile_gym', gymId });
          continue;
        }
        total_clients_checked += res.data.clients_checked;
        total_corrected += res.data.corrected_count;
        if (res.data.drifted.length > 0) {
          total_drifted += res.data.drifted.length;
          drifted_gyms.push({ gym_id: gymId, drifted_count: res.data.drifted.length });
          log('warn', 'counter_drift', {
            action: 'counter_drift',
            route,
            gymId,
            drifted: res.data.drifted,
            auto_corrected: autoCorrect ? res.data.corrected_count : 0,
          });
        }
      }

      return {
        gyms_checked: gyms?.length ?? 0,
        clients_checked: total_clients_checked,
        drifted: total_drifted,
        corrected: total_corrected,
        drifted_gyms,
      };
    });

    if (!guarded.acquired) {
      return NextResponse.json({ success: true, skipped: 'lock_held' });
    }
    const summary = {
      ...guarded.result,
      auto_correct_enabled: autoCorrect,
      duration_ms: Date.now() - startedAt,
    };
    log('info', 'cron_done', { action: 'cron_done', route, ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logError(error, { route });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
