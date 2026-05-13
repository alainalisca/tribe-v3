/**
 * lib/ai/digest-sender.ts
 *
 * Bridge between the nightly intelligence cron and the email digest.
 *
 * After runIntelligenceForGym finishes a pass, the cron calls this
 * with the gym id + the timestamp the pass began. We:
 *
 *   1. Check the gym's intelligence_email_enabled toggle (skip if off)
 *   2. Pull the gym owner's email + preferred_language
 *   3. Pull every insight created since the pass started (these are
 *      the *new* signals; older insights have already been emailed)
 *   4. Render + send the digest via Resend
 *
 * Failures are logged and swallowed — one gym's email failure must
 * not abort the rest of the cron's gym iteration. The cron logs
 * keep observability.
 *
 * Service-role only; never call this from a user-facing route.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { logError, log } from '@/lib/logger';
import { sendIntelligenceDigest, type DigestInsight } from '@/lib/email/intelligenceDigest';

function buildServiceClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createServiceClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface DigestSendResult {
  /** True if we actually attempted a Resend send. False covers all
   * skip paths (toggle off, no owner, zero new insights, etc.). */
  attempted: boolean;
  /** True only when the send succeeded end-to-end. */
  sent: boolean;
  /** Number of newly-created insights covered by the digest. */
  insight_count: number;
  /** Reason for skipping when attempted = false. Diagnostic. */
  skip_reason?: 'service_role_missing' | 'toggle_off' | 'no_owner_email' | 'no_new_insights' | 'resend_not_configured';
}

/**
 * Build + send the digest for a single gym. `runStartIso` is the
 * ISO timestamp the intelligence pass began at — we use it as the
 * lower bound on "fresh" insights.
 */
export async function maybeSendDigestForGym(
  gymId: string,
  runStartIso: string,
  siteUrl: string
): Promise<DigestSendResult> {
  const service = buildServiceClient();
  if (!service) {
    return { attempted: false, sent: false, insight_count: 0, skip_reason: 'service_role_missing' };
  }

  // 1. Gym preferences + owner pointer. Single query.
  const { data: gymRow, error: gymErr } = await service
    .from('gyms')
    .select('id, name, owner_user_id, intelligence_email_enabled')
    .eq('id', gymId)
    .maybeSingle();
  if (gymErr || !gymRow) {
    if (gymErr) logError(gymErr, { action: 'digest.gym_row', gymId });
    return { attempted: false, sent: false, insight_count: 0, skip_reason: 'no_owner_email' };
  }
  if (!gymRow.intelligence_email_enabled) {
    return { attempted: false, sent: false, insight_count: 0, skip_reason: 'toggle_off' };
  }

  // 2. Owner's email + language.
  const { data: ownerRow, error: ownerErr } = await service
    .from('users')
    .select('id, name, email, preferred_language')
    .eq('id', gymRow.owner_user_id)
    .maybeSingle();
  if (ownerErr || !ownerRow || !ownerRow.email) {
    if (ownerErr) logError(ownerErr, { action: 'digest.owner_row', gymId });
    return { attempted: false, sent: false, insight_count: 0, skip_reason: 'no_owner_email' };
  }

  // 3. Insights created since the run started. We deliberately
  //    DON'T filter by is_actioned — the user can't have dismissed
  //    something created in the last few seconds, but covering the
  //    edge case keeps the digest "every insight from this pass."
  //    We DO filter by not-yet-expired (defensive — fresh insights
  //    shouldn't be expired but a clock-skew bug is cheap to guard
  //    against).
  const nowIso = new Date().toISOString();
  const { data: insightRows, error: insightErr } = await service
    .from('community_insights')
    .select(
      `
        id, type, severity, headline, body, data_payload, created_at,
        members:community_insight_members(
          client:clients(id, name)
        )
      `
    )
    .eq('gym_id', gymId)
    .gte('created_at', runStartIso)
    .gt('expires_at', nowIso)
    .order('severity', { ascending: false }) // CRITICAL > HIGH > MEDIUM > LOW alphabetically (cute coincidence)
    .order('created_at', { ascending: false });
  if (insightErr) {
    logError(insightErr, { action: 'digest.insight_rows', gymId, runStartIso });
    return { attempted: false, sent: false, insight_count: 0, skip_reason: 'no_new_insights' };
  }
  if (!insightRows || insightRows.length === 0) {
    return { attempted: false, sent: false, insight_count: 0, skip_reason: 'no_new_insights' };
  }

  // 4. Project to the DigestInsight shape, picking the primary
  //    member when there's exactly one linked (drives the row-level
  //    deep link in the email).
  const insights: DigestInsight[] = insightRows.map((row) => {
    const memberRows = (row.members as unknown as Array<{ client: { id: string; name: string } | null }> | null) ?? [];
    const validMembers = memberRows.map((m) => m.client).filter((c): c is { id: string; name: string } => c !== null);
    const primary = validMembers.length === 1 ? validMembers[0] : null;
    return {
      id: row.id as string,
      type: row.type as DigestInsight['type'],
      severity: row.severity as DigestInsight['severity'],
      headline: row.headline as string,
      body: row.body as string,
      data_payload: row.data_payload ?? null,
      primary_member_id: primary?.id ?? null,
      primary_member_name: primary?.name ?? null,
    };
  });

  // 5. Send. Resend missing is configurable per environment (we
  //    don't want local dev runs to silently error on a missing
  //    env var — log the skip and move on).
  if (!process.env.RESEND_API_KEY) {
    log('warn', 'digest_skipped', {
      action: 'digest.resend_missing',
      gymId,
      insight_count: insights.length,
    });
    return {
      attempted: false,
      sent: false,
      insight_count: insights.length,
      skip_reason: 'resend_not_configured',
    };
  }

  try {
    await sendIntelligenceDigest(
      {
        ownerName: (ownerRow.name as string) ?? 'there',
        ownerEmail: ownerRow.email as string,
        language: (ownerRow.preferred_language as string) === 'es' ? 'es' : 'en',
        gymName: (gymRow.name as string) ?? 'your gym',
        insights,
      },
      siteUrl
    );
    log('info', 'digest_sent', {
      action: 'digest.sent',
      gymId,
      insight_count: insights.length,
      to: ownerRow.email,
    });
    return { attempted: true, sent: true, insight_count: insights.length };
  } catch (error) {
    logError(error, { action: 'digest.send_failed', gymId, insight_count: insights.length });
    return { attempted: true, sent: false, insight_count: insights.length };
  }
}
