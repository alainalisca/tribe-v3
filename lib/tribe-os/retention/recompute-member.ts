import type { SupabaseClient } from '@supabase/supabase-js';
import { scoreRetention } from './compute';
import { logError } from '@/lib/logger';

const ACTIVITY_LOOKBACK_DAYS = 70;

export interface RecomputeResult {
  ok: boolean;
  score: number | null;
  level: string | null;
  error?: string;
}

export async function recomputeMemberRetention(
  supabase: SupabaseClient,
  gymId: string,
  clientId: string,
  route: string,
): Promise<RecomputeResult> {
  const fail = (error: string, raw?: unknown): RecomputeResult => {
    logError(raw ?? new Error(error), { route, clientId, step: 'recompute' });
    return { ok: false, score: null, level: null, error };
  };

  const { data: member, error: memberErr } = await supabase
    .from('clients')
    .select('joined_on, plan_ends_on')
    .eq('id', clientId)
    .eq('gym_id', gymId)
    .single();

  if (memberErr || !member) {
    return fail('member_lookup_failed', memberErr);
  }

  const since = new Date();
  since.setDate(since.getDate() - ACTIVITY_LOOKBACK_DAYS);

  const { data: activities, error: actErr } = await supabase
    .from('client_activity_v2')
    .select('activity_at')
    .eq('gym_id', gymId)
    .eq('client_id', clientId)
    .gte('activity_at', since.toISOString());

  if (actErr) {
    return fail('activities_fetch_failed', actErr);
  }

  const result = scoreRetention({
    client_id: clientId,
    gym_id: gymId,
    joined_on: member.joined_on,
    plan_ends_on: member.plan_ends_on,
    activities: (activities ?? []).map((a) => ({ activity_at: a.activity_at })),
  });

  const { error: upsertErr } = await supabase
    .from('client_retention_v2')
    .upsert(
      {
        client_id: result.client_id,
        gym_id: result.gym_id,
        score: result.score,
        level: result.level,
        reasons: result.reasons,
        signals: result.signals,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'client_id' },
    );

  if (upsertErr) {
    return fail('retention_upsert_failed', upsertErr);
  }

  if (result.level === 'low' || result.level === 'new') {
    const { data: openInsights, error: insightErr } = await supabase
      .from('community_insight_members')
      .select('insight:community_insights!inner(id, type, is_actioned)')
      .eq('client_id', clientId)
      .eq('community_insights.type', 'CHURN_RISK')
      .eq('community_insights.is_actioned', false);

    if (insightErr) {
      logError(insightErr, { route, clientId, step: 'insight_lookup' });
    } else {
      const insightIds = (openInsights ?? [])
        .map((r) => (r.insight as unknown as { id: string })?.id)
        .filter(Boolean);

      if (insightIds.length > 0) {
        const { error: resolveErr } = await supabase
          .from('community_insights')
          .update({ is_actioned: true })
          .in('id', insightIds);

        if (resolveErr) {
          logError(resolveErr, { route, clientId, step: 'insight_resolve' });
        }
      }
    }
  }

  return { ok: true, score: result.score, level: result.level };
}
