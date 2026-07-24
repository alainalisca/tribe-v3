/**
 * lib/email/weeklySummarySender.ts
 *
 * Computes the per-gym weekly stats + dispatches the Monday-morning
 * summary email. Companion to lib/ai/digest-sender.ts (intelligence
 * alerts); same gating + failure semantics.
 *
 * Decision tree:
 *   1. Service role missing → silent skip (local dev)
 *   2. gyms.intelligence_email_enabled is false → silent skip
 *      (we reuse the alert opt-out flag; users who turn off proactive
 *      email get no proactive email — both digests honor it)
 *   3. Owner has no email on file → silent skip
 *   4. RESEND_API_KEY missing → log + skip
 *   5. Otherwise: query stats + send
 *
 * All failures swallowed + logged so a slow Resend never breaks the
 * cron's iteration over the full gym list.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import { sendWeeklySummary, type WeeklySummaryParams } from './weeklySummary';

export interface WeeklySummarySendResult {
  attempted: boolean;
  sent: boolean;
  skip_reason?:
    | 'service_role_missing'
    | 'toggle_off'
    | 'no_owner_email'
    | 'resend_not_configured'
    | 'no_activity'
    | 'send_failed';
}

function buildServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Compute the previous calendar week as an [inclusive, exclusive)
 * ISO range. We treat Monday 00:00 UTC as the week boundary — close
 * enough for the global market we target. A future per-gym timezone
 * version is on the queue.
 */
export function previousWeekRange(now: Date = new Date()): { fromIso: string; toIso: string } {
  // getUTCDay: Sunday = 0, Monday = 1, ... Saturday = 6
  // We want the Monday OF the previous week.
  // Last Monday at 00:00 UTC:
  const lastMondayMidnight = new Date(now);
  lastMondayMidnight.setUTCHours(0, 0, 0, 0);
  const dow = lastMondayMidnight.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7; // Mon=0, Tue=1, ... Sun=6
  // Step back to this week's Monday
  lastMondayMidnight.setUTCDate(lastMondayMidnight.getUTCDate() - daysSinceMonday);
  // Step back another 7 days for LAST week's Monday
  const fromDate = new Date(lastMondayMidnight);
  fromDate.setUTCDate(fromDate.getUTCDate() - 7);
  // Exclusive end = this week's Monday
  const toDate = lastMondayMidnight;
  return { fromIso: fromDate.toISOString(), toIso: toDate.toISOString() };
}

async function buildStats(
  service: SupabaseClient,
  gymId: string,
  fromIso: string,
  toIso: string
): Promise<WeeklySummaryParams['stats']> {
  // Pull all attendance + payment data for clients in this gym
  // during the window. Cheap join — the trigger from 079 has already
  // pre-aggregated nothing useful here, so this query stays the
  // honest source of truth for "last week."
  const { data: rows } = await service
    .from('client_attendance')
    .select(
      `
        client_id, attended, paid, amount_paid_cents, currency,
        client:clients(id, name, gym_id, archived)
      `
    )
    .eq('attended', true)
    .gte('attended_at', fromIso)
    .lt('attended_at', toIso);

  const sameGym = (rows ?? []).filter((r) => {
    const c = r.client as unknown as { gym_id: string | null; archived: boolean } | null;
    return c?.gym_id === gymId && !c.archived;
  });

  const sessionsRecorded = sameGym.length;

  // Unique attenders + per-client counts (for top attender)
  const perClient = new Map<string, { name: string; count: number }>();
  let revenueCents = 0;
  let topCurrency: 'USD' | 'COP' | null = null;
  let usdCount = 0;
  let copCount = 0;
  for (const r of sameGym) {
    const client = r.client as unknown as { id: string; name: string } | null;
    if (client) {
      const slot = perClient.get(client.id) ?? { name: client.name, count: 0 };
      slot.count += 1;
      perClient.set(client.id, slot);
    }
    if (r.paid && r.amount_paid_cents != null) {
      revenueCents += r.amount_paid_cents as number;
      if (r.currency === 'USD') usdCount += 1;
      if (r.currency === 'COP') copCount += 1;
    }
  }
  // Pick the dominant currency for display. Mixed-currency weeks
  // sum the cents naively (which is wrong cross-currency) — we surface
  // the dominant one and trust the coach to dive into /os/revenue for
  // the breakdown.
  topCurrency = usdCount >= copCount ? (usdCount > 0 ? 'USD' : null) : 'COP';

  let topAttender: { name: string; sessions: number } | null = null;
  for (const [, slot] of perClient) {
    if (!topAttender || slot.count > topAttender.sessions) {
      topAttender = { name: slot.name, sessions: slot.count };
    }
  }

  // At-risk + active-insight counts come from current state, not the
  // historical window — the email is a Monday-morning briefing on
  // what to act on THIS week.
  const [atRiskRes, insightsRes] = await Promise.all([
    service
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('archived', false)
      .eq('health_status', 'AT_RISK'),
    service
      .from('community_insights')
      .select('id', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .eq('is_actioned', false)
      .gt('expires_at', new Date().toISOString()),
  ]);

  return {
    sessionsRecorded,
    uniqueAttenders: perClient.size,
    revenueCents,
    revenueCurrency: topCurrency,
    topAttender,
    atRiskCount: atRiskRes.count ?? 0,
    activeInsights: insightsRes.count ?? 0,
  };
}

export async function maybeSendWeeklySummary(gymId: string, siteUrl: string): Promise<WeeklySummarySendResult> {
  const service = buildServiceClient();
  if (!service) {
    return { attempted: false, sent: false, skip_reason: 'service_role_missing' };
  }

  // 1. Gym + owner pointer + opt-out toggle in one query.
  const { data: gymRow, error: gymErr } = await service
    .from('gyms')
    .select('id, name, owner_user_id, intelligence_email_enabled')
    .eq('id', gymId)
    .maybeSingle();
  if (gymErr || !gymRow) {
    if (gymErr) logError(gymErr, { action: 'weeklySummary.gym_row', gymId });
    return { attempted: false, sent: false, skip_reason: 'no_owner_email' };
  }
  if (!gymRow.intelligence_email_enabled) {
    return { attempted: false, sent: false, skip_reason: 'toggle_off' };
  }

  // 2. Owner email + language.
  const { data: ownerRow, error: ownerErr } = await service
    .from('users')
    .select('name, email, preferred_language')
    .eq('id', gymRow.owner_user_id)
    .maybeSingle();
  if (ownerErr || !ownerRow || !ownerRow.email) {
    if (ownerErr) logError(ownerErr, { action: 'weeklySummary.owner_row', gymId });
    return { attempted: false, sent: false, skip_reason: 'no_owner_email' };
  }

  if (!process.env.RESEND_API_KEY) {
    log('warn', 'weekly_summary_skipped', {
      action: 'weeklySummary.resend_missing',
      gymId,
    });
    return { attempted: false, sent: false, skip_reason: 'resend_not_configured' };
  }

  // 3. Compute stats + send.
  const { fromIso, toIso } = previousWeekRange();
  try {
    const stats = await buildStats(service, gymId, fromIso, toIso);

    // Nothing happened and nothing needs acting on: send no email at all.
    // Without this the summary still goes out reading "No attendance recorded
    // this week. If that's a surprise, head to /os/dashboard to investigate."
    // with revenue as an em dash, which is a weekly nag for a gym that is
    // simply idle, and would be a brand-new customer's first impression.
    //
    // at_risk and active insights are checked as well as attendance because
    // they are current-state, not window-state: a gym with no sessions this
    // week but three clients drifting toward churn DOES have something worth
    // reading, and suppressing that would hide the most useful email we send.
    if (stats.sessionsRecorded === 0 && stats.atRiskCount === 0 && stats.activeInsights === 0) {
      log('info', 'weekly_summary_skipped', {
        action: 'weeklySummary.no_activity',
        gymId,
      });
      return { attempted: false, sent: false, skip_reason: 'no_activity' };
    }

    await sendWeeklySummary(
      {
        ownerName: (ownerRow.name as string) ?? 'there',
        ownerEmail: ownerRow.email as string,
        language: (ownerRow.preferred_language as string) === 'es' ? 'es' : 'en',
        gymName: (gymRow.name as string) ?? 'your gym',
        stats,
      },
      siteUrl
    );
    log('info', 'weekly_summary_sent', {
      action: 'weeklySummary.sent',
      gymId,
      sessions: stats.sessionsRecorded,
      attenders: stats.uniqueAttenders,
      revenue_cents: stats.revenueCents,
    });
    return { attempted: true, sent: true };
  } catch (error) {
    logError(error, { action: 'weeklySummary.send_failed', gymId });
    return { attempted: true, sent: false, skip_reason: 'send_failed' };
  }
}
