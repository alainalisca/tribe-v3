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
