/**
 * GET /api/cron/tribe-os/weekly-summary
 *
 * Monday-morning weekly summary email. Iterates over every premium
 * gym, computes last week's stats, and sends a bilingual digest to
 * each gym owner who hasn't opted out.
 *
 * Schedule: vercel.json fires this at `0 8 * * 1` UTC — Monday 8am
 * UTC, which is 3am Medellín. Quiet hours for the gym, fresh inbox
 * when the coach wakes up.
 *
 * Different signal than the intelligence digest:
 *   - Intelligence: "you have N new alerts" (reactive, per-event)
 *   - Weekly:       "here's last week" (reflective, periodic)
 *
 * Auth: Bearer CRON_SECRET (matches other Tribe cron jobs).
 *
 * Opt-out: shares the gyms.intelligence_email_enabled flag from
 * migration 081 — users who turn off proactive email get no
 * proactive email. Both digests honor it.
 */

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isValidCronAuth } from '@/lib/auth/cron';
import { log, logError } from '@/lib/logger';
import { maybeSendWeeklySummary } from '@/lib/email/weeklySummarySender';

const MAX_GYMS_PER_RUN = 100;

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tribe-v3.vercel.app';
}

export async function GET(request: Request): Promise<NextResponse> {
  const route = 'cron:tribe-os/weekly-summary';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    const authHeader = request.headers.get('authorization');
    if (!isValidCronAuth(authHeader)) {
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

    // Concurrency guard. See app/api/cron/tribe-os/audit-watchdog
    // for the canonical pattern; migration 084 introduces the
    // cron_try_lock / cron_release_lock RPCs.
    let lockHeldByUs = false;
    try {
      const { data: locked } = await service.rpc('cron_try_lock', { p_key: 'weekly-summary' });
      if (locked === false) {
        log('warn', 'cron_skipped_lock_held', { route });
        return NextResponse.json({ success: true, skipped: 'lock_held' });
      }
      lockHeldByUs = locked === true;
    } catch {
      // RPC unavailable (migration not applied yet); proceed without lock.
    }

    try {
      const { data: gymRows, error: gymErr } = await service
        .from('gyms')
        .select('id, name')
        .eq('tribe_os_status', 'active')
        .not('tribe_os_tier', 'is', null)
        .limit(MAX_GYMS_PER_RUN);
      if (gymErr) {
        logError(gymErr, { action: 'cron.weekly.list_gyms' });
        return NextResponse.json({ error: gymErr.message }, { status: 500 });
      }

      let gymsProcessed = 0;
      let summariesSent = 0;
      let skippedToggle = 0;
      let skippedOther = 0;
      let errored = 0;

      for (const g of gymRows ?? []) {
        const gymId = g.id as string;
        try {
          const result = await maybeSendWeeklySummary(gymId, siteUrl());
          gymsProcessed += 1;
          if (result.sent) summariesSent += 1;
          else if (result.skip_reason === 'toggle_off') skippedToggle += 1;
          else if (result.attempted) errored += 1;
          else skippedOther += 1;
        } catch (error) {
          errored += 1;
          logError(error, { action: 'cron.weekly.gym', gymId });
        }
      }

      const payload = {
        success: true,
        gyms_processed: gymsProcessed,
        summaries_sent: summariesSent,
        skipped_toggle: skippedToggle,
        skipped_other: skippedOther,
        errored,
        duration_ms: Date.now() - startedAt,
      };
      log('info', 'cron_complete', { action: 'cron_complete', route, ...payload });
      return NextResponse.json(payload);
    } finally {
      if (lockHeldByUs) {
        try {
          await service.rpc('cron_release_lock', { p_key: 'weekly-summary' });
        } catch {
          // ignore
        }
      }
    }
  } catch (error) {
    logError(error, { route });
    log('error', 'cron_failed', { action: 'cron_failed', route, duration_ms: Date.now() - startedAt });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
