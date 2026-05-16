/**
 * lib/ai/insight-generator.ts
 *
 * Translates scored members into community_insight rows.
 *
 * Tier-1 v1 rule (heuristic, not LLM): for every member whose
 * fresh churn_risk_score crosses the AT_RISK threshold (≥ 0.6), we
 * generate a single CHURN_RISK insight with HIGH severity. The
 * insight references that member, carries the score in
 * data_payload for auditability, and offers a SEND_MESSAGE action.
 *
 * Future iterations (deferred to Phase D round 2):
 *   - RETENTION_OPP cards when an AT_RISK member's training
 *     partner is still HEALTHY (intervention path: nudge the
 *     healthy one to bring them back).
 *   - REVENUE cards when failed payments accumulate.
 *   - GROWTH cards when waitlists pile up.
 *
 * Insights expire after 14 days by default — the nightly job will
 * regenerate fresh ones for members still scoring high. We also
 * dedupe by checking for an open (unactioned + unexpired)
 * CHURN_RISK insight already referencing the same member.
 *
 * This module is service-role only — it writes to community_insights
 * which has no INSERT policy for the authenticated role.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import { renderTemplate, type InsightTemplate, type InsightTemplateArgs } from './insight-templates';
import type { ScoreOutput } from './types';

const INSIGHT_EXPIRY_DAYS = 14;

interface MemberLite {
  id: string;
  name: string;
  gym_id: string;
}

interface GenerateResult {
  insights_created: number;
  insights_skipped_duplicate: number;
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
 * Generate CHURN_RISK insights for a batch of scored members.
 * Skips members whose health_status came back HEALTHY or WATCH.
 * Dedupes against any open insight already referencing the same
 * member.
 */
export async function generateChurnInsights(
  gymId: string,
  scoredMembers: Array<{ score: ScoreOutput; member: MemberLite }>
): Promise<GenerateResult> {
  const service = buildServiceClient();
  if (!service) return { insights_created: 0, insights_skipped_duplicate: 0 };

  const atRisk = scoredMembers.filter((s) => s.score.healthStatus === 'AT_RISK');
  if (atRisk.length === 0) {
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Dedupe step: pull every open CHURN_RISK insight for this gym
  // and the set of member_ids each one references.
  const { data: openInsights, error: openErr } = await service
    .from('community_insights')
    .select('id, members:community_insight_members(client_id)')
    .eq('gym_id', gymId)
    .eq('type', 'CHURN_RISK')
    .eq('is_actioned', false)
    .gt('expires_at', new Date().toISOString());
  if (openErr) {
    logError(openErr, { action: 'generateChurnInsights.dedupe', gymId });
  }
  const alreadyCovered = new Set<string>();
  for (const row of openInsights ?? []) {
    const memberLinks = (row.members as unknown as Array<{ client_id: string }> | null) ?? [];
    for (const m of memberLinks) alreadyCovered.add(m.client_id);
  }

  let created = 0;
  let skipped = 0;
  const now = new Date();
  const expires = new Date(now.getTime() + INSIGHT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // One insight per at-risk member. Each gets a HIGH-severity
  // CHURN_RISK card with the member name in the headline and the
  // score breakdown stashed in data_payload.
  for (const { score, member } of atRisk) {
    if (alreadyCovered.has(member.id)) {
      skipped += 1;
      continue;
    }

    // Build templates for headline + body. We persist both the
    // resolved English strings (so old readers without the template
    // layer still display correctly) AND the templates themselves
    // inside data_payload (so the UI can re-render in Spanish at
    // display time without round-tripping through the DB).
    const headlineTemplate: InsightTemplate = {
      key: 'churn_risk.default.headline',
      args: { name: member.name },
    };
    const bodyTemplate = buildBodyTemplate(score);
    const headline = renderTemplate(headlineTemplate, 'en');
    const body = renderTemplate(bodyTemplate, 'en');

    const insertRes = await service
      .from('community_insights')
      .insert({
        gym_id: gymId,
        type: 'CHURN_RISK',
        severity: score.churnRiskScore >= 0.8 ? 'CRITICAL' : 'HIGH',
        is_actioned: false,
        headline,
        body,
        action_label: 'Reach out',
        action_type: 'SEND_MESSAGE',
        data_payload: {
          score: score.churnRiskScore,
          health_status: score.healthStatus,
          signal_breakdown: score.signalBreakdown,
          // Embedded i18n templates — the UI prefers these over the
          // headline/body strings and renders in the caller's
          // language. Older insights without this block fall back
          // to the persisted English fields.
          template: {
            headline: headlineTemplate,
            body: bodyTemplate,
          },
        },
        predicted_revenue_cents: null,
        confidence_score: 0.7,
        expires_at: expires.toISOString(),
      })
      .select('id')
      .single();
    if (insertRes.error || !insertRes.data) {
      logError(insertRes.error ?? new Error('insert returned no row'), {
        action: 'generateChurnInsights.insert',
        gymId,
        memberId: member.id,
      });
      continue;
    }

    // Link the member.
    const linkRes = await service
      .from('community_insight_members')
      .insert({ insight_id: insertRes.data.id, client_id: member.id });
    if (linkRes.error) {
      logError(linkRes.error, {
        action: 'generateChurnInsights.link',
        gymId,
        memberId: member.id,
        insightId: insertRes.data.id,
      });
    }
    created += 1;
  }

  return { insights_created: created, insights_skipped_duplicate: skipped };
}

/**
 * Build a body template from the score breakdown. Picks the top
 * contributing signal to give the coach context for the alert.
 *
 * Returns a template (key + args) rather than a rendered string —
 * the caller resolves it to en for persistence + the UI resolves it
 * to whatever language the coach is in at display time.
 *
 * The body always carries the top signal NAME (not its translation)
 * in args; the renderer looks up the localized label via the
 * SIGNAL_LABEL map in insight-templates.ts. We pre-format the
 * numerics here because the template substitution layer is dumb
 * (no Intl.NumberFormat) — 0.72 becomes "0.72" exactly as written.
 */
function buildBodyTemplate(score: ScoreOutput): InsightTemplate {
  const entries = Object.entries(score.signalBreakdown);
  const scoreFmt = score.churnRiskScore.toFixed(2);
  if (entries.length === 0) {
    return {
      key: 'churn_risk.no_signals.body',
      args: { score: scoreFmt } satisfies InsightTemplateArgs,
    };
  }
  entries.sort((a, b) => b[1] - a[1]);
  const [topSignal, topValue] = entries[0];
  return {
    key: 'churn_risk.default.body',
    args: {
      score: scoreFmt,
      // The renderer will localize `topSignal` via SIGNAL_LABEL.
      // We pass the raw key — it doubles as the lookup token in
      // the renderer, which calls the translation table itself.
      // (Falls back to the raw key if the signal isn't mapped.)
      topSignal,
      topValue: topValue.toFixed(2),
    } satisfies InsightTemplateArgs,
  };
}

// ====================================================================
// RETENTION_OPP / REVENUE / GROWTH insights
// ====================================================================
//
// Three additional insight types that piggyback on the same scoring
// pass as CHURN_RISK. Each one:
//   1. Pulls the candidate set from the DB
//   2. Filters to actionable rows
//   3. Dedupes against open insights covering the same subject
//   4. Inserts new community_insights + community_insight_members
//
// All run after generateChurnInsights inside runIntelligenceForGym
// so a single nightly pass produces every kind of card. Each returns
// the same GenerateResult shape so the cron can sum them into a
// single insights_created tally.
//
// Shared insert helper: reduces ~50 lines of boilerplate per type to
// a single call. Keeps the per-type generators short and focused on
// their heuristic logic.

interface InsertInsightInput {
  service: SupabaseClient;
  gymId: string;
  type: 'CHURN_RISK' | 'RETENTION_OPP' | 'REVENUE' | 'GROWTH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actionType: 'SEND_MESSAGE' | 'CREATE_SESSION' | 'CALL_MEMBER' | 'REVIEW_SCHEDULE' | null;
  actionLabel: string | null;
  headlineTemplate: InsightTemplate;
  bodyTemplate: InsightTemplate;
  /** Clients to link via community_insight_members. Empty for gym-level insights (e.g. GROWTH). */
  memberIds: string[];
  predictedRevenueCents?: number | null;
  confidenceScore?: number | null;
  /** Extra data to merge into data_payload alongside the i18n templates. */
  extraPayload?: Record<string, unknown>;
  expiresAt: string;
}

async function insertInsight(input: InsertInsightInput): Promise<boolean> {
  const headline = renderTemplate(input.headlineTemplate, 'en');
  const body = renderTemplate(input.bodyTemplate, 'en');
  const insertRes = await input.service
    .from('community_insights')
    .insert({
      gym_id: input.gymId,
      type: input.type,
      severity: input.severity,
      is_actioned: false,
      headline,
      body,
      action_label: input.actionLabel,
      action_type: input.actionType,
      data_payload: {
        ...(input.extraPayload ?? {}),
        template: {
          headline: input.headlineTemplate,
          body: input.bodyTemplate,
        },
      },
      predicted_revenue_cents: input.predictedRevenueCents ?? null,
      confidence_score: input.confidenceScore ?? null,
      expires_at: input.expiresAt,
    })
    .select('id')
    .single();
  if (insertRes.error || !insertRes.data) {
    logError(insertRes.error ?? new Error('insert returned no row'), {
      action: 'insertInsight',
      gymId: input.gymId,
      type: input.type,
    });
    return false;
  }
  if (input.memberIds.length > 0) {
    const linkRows = input.memberIds.map((cid) => ({
      insight_id: insertRes.data.id,
      client_id: cid,
    }));
    const linkRes = await input.service.from('community_insight_members').insert(linkRows);
    if (linkRes.error) {
      logError(linkRes.error, {
        action: 'insertInsight.link',
        gymId: input.gymId,
        type: input.type,
        insightId: insertRes.data.id,
      });
    }
  }
  return true;
}

// --- RETENTION_OPP ----------------------------------------------------
//
// "Your healthy member has an at-risk training partner — let them
// pull the at-risk one back." Peer-to-peer save attempts convert at
// much higher rates than coach-led check-ins because the relationship
// already exists. We surface this opportunity to the coach so they
// can deliberately ask the healthy member.
//
// Heuristic:
//   - For every (member_a, member_b) training_partners edge in this gym
//   - Where exactly one side is AT_RISK and the other is HEALTHY
//   - Generate a RETENTION_OPP insight where the SUBJECT is the
//     healthy member (they're the one we want to action)
//
// Severity: MEDIUM by default; HIGH when the healthy member has 2+
// at-risk partners (network is collapsing, they're the linchpin).
//
// Dedupe: skip if an open RETENTION_OPP already references the same
// healthy-member subject.

export async function generateRetentionInsights(gymId: string): Promise<GenerateResult> {
  const service = buildServiceClient();
  if (!service) return { insights_created: 0, insights_skipped_duplicate: 0 };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INSIGHT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Pull every training-partner edge for this gym with health_status
  // on both sides. Two-hop join: training_partners → clients (a) +
  // clients (b). We then classify in JS — Postgres can't filter "one
  // side AT_RISK, other HEALTHY" without a CASE-rich WHERE clause.
  const { data: edges, error: edgesErr } = await service
    .from('training_partners')
    .select(
      `
        member_a_id, member_b_id,
        client_a:clients!training_partners_member_a_id_fkey(id, name, health_status, status, archived),
        client_b:clients!training_partners_member_b_id_fkey(id, name, health_status, status, archived)
      `
    )
    .eq('gym_id', gymId);
  if (edgesErr) {
    logError(edgesErr, { action: 'generateRetentionInsights.edges', gymId });
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Map healthy member -> set of their at-risk partners. We aggregate
  // before generating so a healthy member with multiple at-risk
  // partners produces one HIGH-severity insight, not multiple medium
  // ones.
  type Partner = { id: string; name: string };
  const healthyToAtRisk = new Map<string, { healthy: Partner; atRisk: Partner[] }>();

  for (const edge of edges ?? []) {
    const a = edge.client_a as unknown as {
      id: string;
      name: string;
      health_status: string | null;
      status: string | null;
      archived: boolean;
    } | null;
    const b = edge.client_b as unknown as {
      id: string;
      name: string;
      health_status: string | null;
      status: string | null;
      archived: boolean;
    } | null;
    if (!a || !b || a.archived || b.archived) continue;

    // Only consider active/lapsed status — leads/inactive aren't
    // retention candidates.
    const aEligible = a.status === 'active' || a.status === 'lapsed';
    const bEligible = b.status === 'active' || b.status === 'lapsed';
    if (!aEligible || !bEligible) continue;

    const aHealthy = a.health_status === 'HEALTHY' || a.health_status == null;
    const bHealthy = b.health_status === 'HEALTHY' || b.health_status == null;
    const aAtRisk = a.health_status === 'AT_RISK';
    const bAtRisk = b.health_status === 'AT_RISK';

    let healthy: Partner | null = null;
    let atRisk: Partner | null = null;
    if (aHealthy && bAtRisk) {
      healthy = { id: a.id, name: a.name };
      atRisk = { id: b.id, name: b.name };
    } else if (bHealthy && aAtRisk) {
      healthy = { id: b.id, name: b.name };
      atRisk = { id: a.id, name: a.name };
    }
    if (!healthy || !atRisk) continue;

    const slot = healthyToAtRisk.get(healthy.id) ?? { healthy, atRisk: [] };
    if (!slot.atRisk.some((p) => p.id === atRisk!.id)) slot.atRisk.push(atRisk);
    healthyToAtRisk.set(healthy.id, slot);
  }

  if (healthyToAtRisk.size === 0) {
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Dedupe step: pull open RETENTION_OPP insights and the healthy-
  // member subject each one already covers.
  const { data: openRows } = await service
    .from('community_insights')
    .select('id, members:community_insight_members(client_id)')
    .eq('gym_id', gymId)
    .eq('type', 'RETENTION_OPP')
    .eq('is_actioned', false)
    .gt('expires_at', new Date().toISOString());
  const alreadyCovered = new Set<string>();
  for (const row of openRows ?? []) {
    const memberLinks = (row.members as unknown as Array<{ client_id: string }> | null) ?? [];
    for (const m of memberLinks) alreadyCovered.add(m.client_id);
  }

  let created = 0;
  let skipped = 0;

  for (const [healthyId, { healthy, atRisk }] of healthyToAtRisk) {
    if (alreadyCovered.has(healthyId)) {
      skipped += 1;
      continue;
    }
    // Pick the first at-risk partner to feature by name; total count
    // drives severity.
    const featured = atRisk[0];
    const severity: 'MEDIUM' | 'HIGH' = atRisk.length >= 2 ? 'HIGH' : 'MEDIUM';

    const headlineTemplate: InsightTemplate = {
      key: 'retention_opp.partner_at_risk.headline',
      args: { name: healthy.name, partnerName: featured.name },
    };
    const bodyTemplate: InsightTemplate = {
      key: 'retention_opp.partner_at_risk.body',
      args: { name: healthy.name, partnerName: featured.name },
    };

    const ok = await insertInsight({
      service,
      gymId,
      type: 'RETENTION_OPP',
      severity,
      actionType: 'SEND_MESSAGE',
      actionLabel: 'Ask them to nudge',
      headlineTemplate,
      bodyTemplate,
      memberIds: [healthy.id], // subject is the healthy member
      confidenceScore: 0.6,
      extraPayload: {
        at_risk_partner_count: atRisk.length,
        featured_partner_id: featured.id,
        featured_partner_name: featured.name,
      },
      expiresAt,
    });
    if (ok) created += 1;
  }

  return { insights_created: created, insights_skipped_duplicate: skipped };
}

// --- REVENUE ----------------------------------------------------------
//
// "This client trained N times this month without paying." For most
// gyms this is by far the easiest revenue to recover — the relationship
// exists, the work was done, the payment just slipped through.
//
// Heuristic:
//   - Pull last-30-days attendance rows where attended=true AND paid=false
//   - Group by client_id; require ≥ 3 unpaid attended sessions
//   - Estimate the recovery amount using the gym's average paid session
//     value over the same window (if no paid sessions exist, skip the
//     amount — we still surface the count).
//
// Severity: MEDIUM at ≥3 unpaid, HIGH at ≥5.
// Dedupe: skip if an open REVENUE insight already covers this client.

export async function generateRevenueInsights(gymId: string): Promise<GenerateResult> {
  const service = buildServiceClient();
  if (!service) return { insights_created: 0, insights_skipped_duplicate: 0 };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INSIGHT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Pull every attendance row in the window with the client embedded.
  // We need the gym filter via the client join because attendance
  // doesn't carry gym_id directly.
  const { data: rows, error: rowsErr } = await service
    .from('client_attendance')
    .select(
      `
        client_id, attended, paid, amount_paid_cents, currency, attended_at,
        client:clients(id, name, gym_id, archived, status)
      `
    )
    .eq('attended', true)
    .gte('attended_at', thirtyDaysAgo);
  if (rowsErr) {
    logError(rowsErr, { action: 'generateRevenueInsights.rows', gymId });
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Aggregate: per-client count of unpaid attended sessions, plus
  // gym-wide stats for the recovery-amount estimate.
  type Acc = { name: string; unpaidCount: number };
  const byClient = new Map<string, Acc>();
  let paidSessionTotalCents = 0;
  let paidSessionCount = 0;

  for (const r of rows ?? []) {
    const client = r.client as unknown as {
      id: string;
      name: string;
      gym_id: string | null;
      archived: boolean;
      status: string | null;
    } | null;
    if (!client || client.archived) continue;
    if (client.gym_id !== gymId) continue;
    if (client.status !== 'active' && client.status !== 'lapsed') continue;

    if (r.paid && r.amount_paid_cents != null && r.amount_paid_cents > 0) {
      paidSessionTotalCents += r.amount_paid_cents;
      paidSessionCount += 1;
    } else if (!r.paid) {
      const slot = byClient.get(client.id) ?? { name: client.name, unpaidCount: 0 };
      slot.unpaidCount += 1;
      byClient.set(client.id, slot);
    }
  }

  // Gym-level baseline price; null when there's no paid history.
  const avgPaidCents = paidSessionCount > 0 ? Math.round(paidSessionTotalCents / paidSessionCount) : null;

  // Filter to actionable clients (≥3 unpaid sessions).
  const candidates: Array<{ clientId: string; name: string; unpaidCount: number }> = [];
  for (const [clientId, acc] of byClient) {
    if (acc.unpaidCount >= 3) {
      candidates.push({ clientId, name: acc.name, unpaidCount: acc.unpaidCount });
    }
  }
  if (candidates.length === 0) {
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Dedupe.
  const { data: openRows } = await service
    .from('community_insights')
    .select('id, members:community_insight_members(client_id)')
    .eq('gym_id', gymId)
    .eq('type', 'REVENUE')
    .eq('is_actioned', false)
    .gt('expires_at', new Date().toISOString());
  const alreadyCovered = new Set<string>();
  for (const row of openRows ?? []) {
    const memberLinks = (row.members as unknown as Array<{ client_id: string }> | null) ?? [];
    for (const m of memberLinks) alreadyCovered.add(m.client_id);
  }

  let created = 0;
  let skipped = 0;

  for (const { clientId, name, unpaidCount } of candidates) {
    if (alreadyCovered.has(clientId)) {
      skipped += 1;
      continue;
    }
    const recoveryCents = avgPaidCents != null ? avgPaidCents * unpaidCount : null;
    const severity: 'MEDIUM' | 'HIGH' = unpaidCount >= 5 ? 'HIGH' : 'MEDIUM';
    // Format the amount for the template — $XX.XX style. When we
    // don't have a baseline price we say "a few sessions" instead
    // of a fake dollar figure.
    const amountStr = recoveryCents != null ? `$${(recoveryCents / 100).toFixed(2)}` : `${unpaidCount} sessions`;

    const headlineTemplate: InsightTemplate = {
      key: 'revenue.unpaid_attendance.headline',
      args: { name, count: unpaidCount },
    };
    const bodyTemplate: InsightTemplate = {
      key: 'revenue.unpaid_attendance.body',
      args: { amount: amountStr },
    };

    const ok = await insertInsight({
      service,
      gymId,
      type: 'REVENUE',
      severity,
      actionType: 'SEND_MESSAGE',
      actionLabel: 'Ask for payment',
      headlineTemplate,
      bodyTemplate,
      memberIds: [clientId],
      predictedRevenueCents: recoveryCents,
      confidenceScore: 0.8,
      extraPayload: {
        unpaid_count: unpaidCount,
        avg_paid_cents: avgPaidCents,
      },
      expiresAt,
    });
    if (ok) created += 1;
  }

  return { insights_created: created, insights_skipped_duplicate: skipped };
}

// --- GROWTH -----------------------------------------------------------
//
// "Your Tuesday 5pm CrossFit is consistently full — add a second
// slot." When a recurring session series fills near capacity multiple
// weeks in a row, the demand exists; adding capacity is the
// lowest-risk way to capture it.
//
// Heuristic:
//   - Pull sessions from the last 28 days for this gym
//   - Group by (title, sport, day-of-week, start hour) — a rough
//     proxy for a "recurring class"
//   - For each group with at least 3 sessions in the window, compute
//     average fill rate (current_participants / max_participants)
//   - Flag groups whose 3+ of the last 4 sessions hit ≥ 90% fill
//
// Severity: MEDIUM for 90%+ fill, HIGH for 100%+ (waitlist territory).
// Dedupe: gym-level insight; key the dedupe on a stable session-group
// signature stored in data_payload.

export async function generateGrowthInsights(gymId: string): Promise<GenerateResult> {
  const service = buildServiceClient();
  if (!service) return { insights_created: 0, insights_skipped_duplicate: 0 };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INSIGHT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();

  // Sessions table joins via creator_id → users → owner_user_id on
  // gyms. We don't have a gym_id column on sessions, so we scope via
  // the user that owns the gym. (If later migrations add sessions.gym_id
  // we can simplify here.)
  const { data: gym, error: gymErr } = await service.from('gyms').select('owner_user_id').eq('id', gymId).maybeSingle();
  if (gymErr || !gym) {
    if (gymErr) logError(gymErr, { action: 'generateGrowthInsights.gym', gymId });
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  const { data: sessions, error: sessionsErr } = await service
    .from('sessions')
    .select('id, title, sport, date, start_time, current_participants, max_participants')
    .eq('creator_id', gym.owner_user_id)
    .gte('date', twentyEightDaysAgo.slice(0, 10))
    .order('date', { ascending: false });
  if (sessionsErr) {
    logError(sessionsErr, { action: 'generateGrowthInsights.sessions', gymId });
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Group by series signature: title + sport + day-of-week + start-hour
  // gives us "Tuesday 5pm CrossFit" as a single bucket.
  interface SeriesAgg {
    signature: string;
    label: string;
    samples: number[]; // fill ratios, newest first
  }
  const series = new Map<string, SeriesAgg>();
  for (const s of sessions ?? []) {
    const title = (s.title as string | null) ?? '';
    const sport = (s.sport as string) ?? '';
    const date = s.date as string;
    const startTime = (s.start_time as string | null) ?? '00:00';
    const max = (s.max_participants as number) ?? 0;
    const current = (s.current_participants as number) ?? 0;
    if (max <= 0) continue;
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const hour = startTime.slice(0, 2);
    const sig = `${title}|${sport}|${dow}|${hour}`;
    const label = title || sport || 'Untitled session';
    const slot = series.get(sig) ?? { signature: sig, label, samples: [] };
    slot.samples.push(current / max);
    series.set(sig, slot);
  }

  // Identify candidate series: ≥3 samples, ≥3 of last 4 hit 90%+.
  const candidates: Array<{ signature: string; label: string; fillPct: number; weekCount: number }> = [];
  for (const agg of series.values()) {
    if (agg.samples.length < 3) continue;
    const lastFour = agg.samples.slice(0, 4);
    const hits = lastFour.filter((r) => r >= 0.9).length;
    if (hits < 3) continue;
    const avgFill = lastFour.reduce((acc, r) => acc + r, 0) / lastFour.length;
    candidates.push({
      signature: agg.signature,
      label: agg.label,
      fillPct: Math.round(avgFill * 100),
      weekCount: hits,
    });
  }
  if (candidates.length === 0) {
    return { insights_created: 0, insights_skipped_duplicate: 0 };
  }

  // Dedupe by signature stored in data_payload of open GROWTH insights.
  // GROWTH insights are gym-level (no community_insight_members rows)
  // so we can't dedupe via the member-link table — we use the payload
  // signature instead.
  const { data: openRows } = await service
    .from('community_insights')
    .select('id, data_payload')
    .eq('gym_id', gymId)
    .eq('type', 'GROWTH')
    .eq('is_actioned', false)
    .gt('expires_at', new Date().toISOString());
  const alreadySignatures = new Set<string>();
  for (const row of openRows ?? []) {
    const payload = row.data_payload as Record<string, unknown> | null;
    const sig = payload?.signature;
    if (typeof sig === 'string') alreadySignatures.add(sig);
  }

  let created = 0;
  let skipped = 0;

  for (const c of candidates) {
    if (alreadySignatures.has(c.signature)) {
      skipped += 1;
      continue;
    }
    const severity: 'MEDIUM' | 'HIGH' = c.fillPct >= 100 ? 'HIGH' : 'MEDIUM';

    const headlineTemplate: InsightTemplate = {
      key: 'growth.high_fill_rate.headline',
      args: { sessionLabel: c.label },
    };
    const bodyTemplate: InsightTemplate = {
      key: 'growth.high_fill_rate.body',
      args: { sessionLabel: c.label, fillPct: c.fillPct, weekCount: c.weekCount },
    };

    const ok = await insertInsight({
      service,
      gymId,
      type: 'GROWTH',
      severity,
      actionType: 'REVIEW_SCHEDULE',
      actionLabel: 'Open schedule',
      headlineTemplate,
      bodyTemplate,
      memberIds: [], // gym-level, no member subject
      confidenceScore: 0.7,
      extraPayload: {
        signature: c.signature,
        fill_pct: c.fillPct,
        week_count: c.weekCount,
      },
      expiresAt,
    });
    if (ok) created += 1;
  }

  return { insights_created: created, insights_skipped_duplicate: skipped };
}
