/**
 * GET /api/cron/tribe-os/audit-watchdog
 *
 * Sweeps gym_audit_log for destructive-action clusters across every
 * premium-active gym and emails the gym owner when thresholds trip.
 *
 * Schedule: every 6 hours (cron expression lives in vercel.json).
 * The watchdog is async by design — alerting inline with each
 * mutation would slow every destructive route under bursty load
 * and create a fan-out problem. Worst-case 6h lag between an
 * incident and an email is acceptable for these signals (they're
 * accountability, not incident response).
 *
 * Auth: Bearer CRON_SECRET (matches the other tribe-os crons).
 *
 * Per-gym flow:
 *   1. evaluateGymAuditThresholds → list of TriggeredAlert
 *   2. Resolve actor display labels (one users-table lookup per
 *      distinct actor in the gym's alert set)
 *   3. Send ONE email per gym with all triggered alerts batched
 *   4. Write a `gym.alert_sent` audit-log row per trigger key for
 *      suppression
 *
 * Service-role bypasses RLS, so the cron can insert audit rows
 * with `actor_user_id = NULL` — that's our system-action signal.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { log, logError } from '@/lib/logger';
import { evaluateGymAuditThresholds, type TriggeredAlert } from '@/lib/dal/auditWatchdog';
import { sendAuditAlertEmail, type AuditAlertItem } from '@/lib/email/auditAlertEmail';

const MAX_GYMS_PER_RUN = 100;

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tribe-v3.vercel.app';
}

interface ActorRow {
  id: string;
  name: string | null;
  email: string | null;
  preferred_language: string | null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const route = 'cron:tribe-os/audit-watchdog';
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
    // The `as unknown as SupabaseClient` cast strips the table-typed
    // generic parameters that `createClient<Database>` would emit if
    // we threaded a schema type through — our DAL helpers take the
    // loose SupabaseClient shape, and the service-role client's
    // extra type params clash with that. Cast once at construction
    // so the rest of the route is untyped-table-friendly.
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as SupabaseClient;

    // Concurrency guard via migration 084's advisory-lock RPC. If
    // another invocation is already running (manual fire over a
    // scheduled run, or Vercel duplicate delivery), skip cleanly.
    // The RPC errors are tolerated (migration not yet applied →
    // data === null) and the cron proceeds without the lock; once
    // 084 is applied the guard kicks in.
    let lockHeldByUs = false;
    try {
      const { data: locked } = await service.rpc('cron_try_lock', { p_key: 'audit-watchdog' });
      if (locked === false) {
        log('warn', 'cron_skipped_lock_held', { route });
        return NextResponse.json({ success: true, skipped: 'lock_held' });
      }
      lockHeldByUs = locked === true;
    } catch {
      // RPC unavailable; proceed without the lock.
    }

    try {
      // Premium-active gyms only — non-premium gyms don't get the
      // watchdog because they don't get the audit log surface either.
      const { data: gymRows, error: gymErr } = await service
        .from('gyms')
        .select('id, name, owner_user_id, tribe_os_tier, tribe_os_status')
        .eq('tribe_os_status', 'active')
        .not('tribe_os_tier', 'is', null)
        .limit(MAX_GYMS_PER_RUN);
      if (gymErr) {
        logError(gymErr, { action: 'audit_watchdog.list_gyms' });
        return NextResponse.json({ error: gymErr.message }, { status: 500 });
      }

      let gymsProcessed = 0;
      let gymsWithAlerts = 0;
      let totalAlertsTriggered = 0;
      let emailsSent = 0;
      let emailsFailed = 0;

      for (const g of gymRows ?? []) {
        const gymId = g.id as string;
        const gymName = (g.name as string) ?? '(unnamed)';
        const ownerId = g.owner_user_id as string | null;

        try {
          const triggered = await evaluateGymAuditThresholds(service, gymId);
          gymsProcessed += 1;
          if (triggered.length === 0) continue;

          gymsWithAlerts += 1;
          totalAlertsTriggered += triggered.length;

          // Resolve owner email + language. If the owner row is gone
          // or has no email, log and skip — we can't email an absent
          // user, but the audit log still captured the events.
          if (!ownerId) {
            log('warn', 'audit_watchdog.no_owner', { action: 'audit_watchdog.no_owner', gymId });
            continue;
          }
          const { data: ownerRow, error: ownerErr } = await service
            .from('users')
            .select('email, name, preferred_language')
            .eq('id', ownerId)
            .maybeSingle();
          if (ownerErr || !ownerRow?.email) {
            logError(ownerErr ?? new Error('owner row missing'), {
              action: 'audit_watchdog.owner_lookup',
              gymId,
              ownerId,
            });
            continue;
          }

          // Resolve actor labels in one batched query. Pre-purge the
          // set of actor ids from the triggered alerts.
          const actorIds = Array.from(
            new Set(triggered.map((t) => t.actor_user_id).filter((id): id is string => !!id))
          );
          const actorMap = new Map<string, ActorRow>();
          if (actorIds.length > 0) {
            const { data: actorRows } = await service
              .from('users')
              .select('id, name, email, preferred_language')
              .in('id', actorIds);
            for (const row of actorRows ?? []) {
              actorMap.set(row.id as string, row as ActorRow);
            }
          }

          const alertItems: AuditAlertItem[] = triggered.map((t) => {
            if (!t.actor_user_id) {
              return {
                action: t.action,
                actor_label: '—',
                actor_user_id: null,
                count: t.count,
                window_hours: t.window_hours,
                earliest_at: t.earliest_at,
                latest_at: t.latest_at,
              };
            }
            const actor = actorMap.get(t.actor_user_id);
            const label = actor?.name?.trim() || actor?.email || 'Unknown coach';
            return {
              action: t.action,
              actor_label: label,
              actor_user_id: t.actor_user_id,
              count: t.count,
              window_hours: t.window_hours,
              earliest_at: t.earliest_at,
              latest_at: t.latest_at,
            };
          });

          if (process.env.RESEND_API_KEY) {
            try {
              await sendAuditAlertEmail(
                {
                  ownerEmail: ownerRow.email,
                  ownerName: (ownerRow.name as string | null) ?? null,
                  language: ((ownerRow.preferred_language as string) === 'es' ? 'es' : 'en') as 'en' | 'es',
                  gymName,
                  alerts: alertItems,
                },
                siteUrl()
              );
              emailsSent += 1;
              log('info', 'audit_watchdog.email_sent', {
                action: 'audit_watchdog.email_sent',
                gymId,
                alert_count: alertItems.length,
              });
            } catch (emailErr) {
              emailsFailed += 1;
              logError(emailErr, { action: 'audit_watchdog.email_failed', gymId });
              // Continue — we still want to write suppression rows even
              // if the email failed, so the next run doesn't retry every
              // 6h. The owner can see the audit log directly at any time.
            }
          }

          // Suppression entries — one per trigger key. The watchdog's
          // own writes are also recorded as audit rows, which is the
          // recursive-but-OK design: 'gym.alert_sent' isn't in the
          // threshold rules so it can't trip itself.
          await writeSuppressionEntries(service, gymId, triggered);
        } catch (innerErr) {
          logError(innerErr, { action: 'audit_watchdog.gym_loop', gymId });
        }
      }

      const elapsedMs = Date.now() - startedAt;
      log('info', 'cron_done', {
        action: 'cron_done',
        route,
        gymsProcessed,
        gymsWithAlerts,
        totalAlertsTriggered,
        emailsSent,
        emailsFailed,
        elapsedMs,
      });

      return NextResponse.json({
        ok: true,
        gymsProcessed,
        gymsWithAlerts,
        totalAlertsTriggered,
        emailsSent,
        emailsFailed,
        elapsedMs,
      });
    } finally {
      // Release the advisory lock taken above. Swallow errors —
      // by this point the work is done and a missed release will
      // be reclaimed when the pooled connection cycles.
      if (lockHeldByUs) {
        try {
          await service.rpc('cron_release_lock', { p_key: 'audit-watchdog' });
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    logError(err, { route });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * Write one `gym.alert_sent` audit-log row per triggered alert,
 * using actor_user_id = NULL to mark it as a system write. The
 * trigger_key in the payload is what the suppression check reads
 * back on the next run.
 */
async function writeSuppressionEntries(
  service: SupabaseClient,
  gymId: string,
  triggered: TriggeredAlert[]
): Promise<void> {
  if (triggered.length === 0) return;
  const rows = triggered.map((t) => ({
    gym_id: gymId,
    actor_user_id: null, // system write — bypasses the actor_user_id = auth.uid() RLS via service-role
    action: 'gym.alert_sent',
    target_type: 'gym',
    target_id: gymId,
    payload: {
      trigger_key: t.trigger_key,
      triggered_action: t.action,
      triggered_actor_user_id: t.actor_user_id,
      count: t.count,
      window_hours: t.window_hours,
    },
  }));
  const { error } = await service.from('gym_audit_log').insert(rows);
  if (error) {
    logError(error, { action: 'audit_watchdog.suppression_write', gymId, count: rows.length });
  }
}
