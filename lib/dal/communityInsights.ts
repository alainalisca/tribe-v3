/**
 * Data-access layer for community_insights.
 *
 * Insights are AI-generated alert cards: "12 members crossed the
 * churn-risk threshold this week" / "Tuesday 5pm CrossFit is
 * waitlisted 3 of the last 4 weeks" / etc. They're produced by the
 * nightly intelligence engine (not yet wired) and surfaced on
 * /os/intelligence.
 *
 * Reads route through normal RLS on community_insights — every gym
 * coach can SELECT, the gym owner can UPDATE is_actioned (dismiss).
 * Writes (INSERT) are service-role only, gated to the nightly batch
 * job.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export type InsightType = 'CHURN_RISK' | 'RETENTION_OPP' | 'REVENUE' | 'GROWTH';
export type InsightSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type InsightActionType = 'SEND_MESSAGE' | 'CREATE_SESSION' | 'CALL_MEMBER' | 'REVIEW_SCHEDULE';

/**
 * Member info embedded in an insight card. We pull just enough to
 * power one-click follow-up actions (WhatsApp deep-link, member-
 * detail nav) without forcing the UI to do a second roundtrip per
 * card.
 */
export interface InsightMember {
  id: string;
  name: string;
  phone: string | null;
}

export interface CommunityInsight {
  id: string;
  gym_id: string;
  type: InsightType;
  severity: InsightSeverity;
  is_actioned: boolean;
  headline: string;
  body: string;
  action_label: string | null;
  action_type: InsightActionType | null;
  data_payload: unknown;
  predicted_revenue_cents: number | null;
  confidence_score: number | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  /** Clients referenced by this insight, joined via community_insight_members. */
  member_ids: string[];
  /** Same set with name + phone for action-button rendering. */
  members: InsightMember[];
}

export interface ListInsightsOptions {
  /** Hide already-dismissed cards (default true). */
  unactionedOnly?: boolean;
  /** Hide expired cards (default true). */
  activeOnly?: boolean;
  /**
   * Restrict to insights whose linked members include at least one
   * client in this team. Gym-level insights (no linked members,
   * e.g. GROWTH cards) drop out of the result when this is set —
   * they don't belong to any team. When unset, the filter doesn't
   * apply and every insight in the gym comes back.
   */
  teamId?: string | null;
}

/**
 * List insight cards for a gym, ordered CRITICAL → HIGH → MEDIUM →
 * LOW, then created_at DESC.
 */
export async function listInsightsForGym(
  supabase: SupabaseClient,
  gymId: string,
  options: ListInsightsOptions = {}
): Promise<DalResult<CommunityInsight[]>> {
  const unactionedOnly = options.unactionedOnly ?? true;
  const activeOnly = options.activeOnly ?? true;
  const teamId = options.teamId ?? null;

  try {
    // Embed client name + phone via a two-hop join so the UI can
    // build wa.me deep-links + show avatar initials without a
    // second roundtrip per insight card.
    let q = supabase
      .from('community_insights')
      .select(
        `
          id, gym_id, type, severity, is_actioned,
          headline, body, action_label, action_type,
          data_payload, predicted_revenue_cents, confidence_score,
          expires_at, created_at, updated_at,
          members:community_insight_members(
            client_id,
            client:clients(id, name, phone)
          )
        `
      )
      .eq('gym_id', gymId);

    if (unactionedOnly) q = q.eq('is_actioned', false);
    if (activeOnly) q = q.gt('expires_at', new Date().toISOString());

    const { data, error } = await q;
    if (error) {
      logError(error, { action: 'listInsightsForGym', gymId });
      return { success: false, error: error.message };
    }

    // Sort by severity rank then created_at DESC. Postgres can't
    // sort by an arbitrary enum order via the query builder so we
    // do it in JS.
    const severityRank: Record<InsightSeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };
    const rows = (data ?? []).map((row) => {
      const memberRows =
        (row.members as unknown as Array<{
          client_id: string;
          client: { id: string; name: string; phone: string | null } | null;
        }> | null) ?? [];
      const members: InsightMember[] = memberRows
        .map((m) => {
          // Prefer the embedded client row when present (it carries
          // name + phone). Fall back to a minimal entry if the join
          // returned only the link row (shouldn't happen with our
          // schema but defensive).
          if (m.client) {
            return { id: m.client.id, name: m.client.name, phone: m.client.phone };
          }
          return { id: m.client_id, name: '', phone: null };
        })
        .filter((m) => !!m.id);
      return {
        id: row.id as string,
        gym_id: row.gym_id as string,
        type: row.type as InsightType,
        severity: row.severity as InsightSeverity,
        is_actioned: row.is_actioned as boolean,
        headline: row.headline as string,
        body: row.body as string,
        action_label: (row.action_label as string | null) ?? null,
        action_type: (row.action_type as InsightActionType | null) ?? null,
        data_payload: row.data_payload,
        predicted_revenue_cents: (row.predicted_revenue_cents as number | null) ?? null,
        confidence_score: (row.confidence_score as number | null) ?? null,
        expires_at: row.expires_at as string,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        member_ids: members.map((m) => m.id),
        members,
      };
    });

    rows.sort((a, b) => {
      const sev = severityRank[a.severity] - severityRank[b.severity];
      if (sev !== 0) return sev;
      return b.created_at.localeCompare(a.created_at);
    });

    // Optional team filter: one extra round-trip to fetch the team's
    // member set, then keep only insights that reference at least one
    // of those members. Gym-level insights (no linked members) fall
    // out naturally — they don't intersect any team.
    let filtered = rows;
    if (teamId) {
      const { data: memberRows, error: memberErr } = await supabase
        .from('gym_team_members')
        .select('client_id')
        .eq('team_id', teamId);
      if (memberErr) {
        logError(memberErr, { action: 'listInsightsForGym.team_filter', gymId, teamId });
        // Fail open: return the unfiltered list rather than nothing.
        // Coach still gets useful data; observability picks up the issue.
      } else {
        const teamMemberSet = new Set((memberRows ?? []).map((r) => r.client_id as string));
        filtered = rows.filter((r) => r.member_ids.some((id) => teamMemberSet.has(id)));
      }
    }

    return { success: true, data: filtered };
  } catch (error) {
    logError(error, { action: 'listInsightsForGym.exception', gymId });
    return { success: false, error: 'Failed to load insights' };
  }
}

/** Mark an insight as dismissed (is_actioned = true). */
export async function actionInsight(supabase: SupabaseClient, insightId: string): Promise<DalResult<null>> {
  try {
    const { error } = await supabase.from('community_insights').update({ is_actioned: true }).eq('id', insightId);
    if (error) {
      logError(error, { action: 'actionInsight', insightId });
      return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'actionInsight.exception', insightId });
    return { success: false, error: 'Failed to dismiss insight' };
  }
}

export type InsightFeedbackSignal = 'helpful' | 'false_positive';

/**
 * Record coach feedback on an insight + dismiss it in one step. The
 * feedback signal goes into data_payload.feedback (no schema
 * migration needed) so we can later look at false-positive rates per
 * insight type and tune the heuristics. Always sets is_actioned=true
 * because both "helpful" and "false positive" mean the insight is
 * done — there's no "leave it on screen but rate it" workflow.
 *
 * We fetch the current data_payload first so we don't blow away any
 * other keys (template, score breakdown, signature, etc.) — partial
 * jsonb updates aren't a Supabase primitive, so it's a read-merge-write.
 */
export async function actionInsightWithFeedback(
  supabase: SupabaseClient,
  insightId: string,
  signal: InsightFeedbackSignal
): Promise<DalResult<null>> {
  try {
    // 1. Read the existing payload so we can merge.
    const { data: existing, error: readErr } = await supabase
      .from('community_insights')
      .select('data_payload')
      .eq('id', insightId)
      .maybeSingle();
    if (readErr) {
      logError(readErr, { action: 'actionInsightWithFeedback.read', insightId });
      return { success: false, error: readErr.message };
    }
    const merged = {
      ...((existing?.data_payload as Record<string, unknown> | null) ?? {}),
      feedback: { signal, at: new Date().toISOString() },
    };

    // 2. Write back + dismiss in one update.
    const { error: writeErr } = await supabase
      .from('community_insights')
      .update({ is_actioned: true, data_payload: merged })
      .eq('id', insightId);
    if (writeErr) {
      logError(writeErr, { action: 'actionInsightWithFeedback.write', insightId });
      return { success: false, error: writeErr.message };
    }
    return { success: true, data: null };
  } catch (error) {
    logError(error, { action: 'actionInsightWithFeedback.exception', insightId });
    return { success: false, error: 'Failed to record feedback' };
  }
}
