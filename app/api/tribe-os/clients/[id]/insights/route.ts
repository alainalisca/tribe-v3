/**
 * GET /api/tribe-os/clients/[id]/insights
 *
 * Returns every insight (active + dismissed + expired) that
 * referenced this specific client, newest first. Used by the
 * "Insight history" section on /os/clients/[id] so coaches can see
 * patterns over time — "the AI has flagged Carlos 4 times in the
 * last 30 days" is a different signal than "Carlos is at-risk right
 * now."
 *
 * Caps at 50 rows to bound the payload. Coaches looking for older
 * history can scan the main /os/intelligence history view.
 *
 * Auth: Tribe.OS premium gate. RLS handles tenant scoping on the
 * insights + insight_members joins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

interface ClientInsightRow {
  id: string;
  type: string;
  severity: string;
  is_actioned: boolean;
  headline: string;
  body: string;
  data_payload: unknown;
  created_at: string;
  expires_at: string;
}

const HISTORY_CAP = 50;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    // Two-hop: community_insight_members → community_insights. RLS
    // on community_insights scopes to the caller's gym, and we
    // additionally constrain by client_id to get THIS member's
    // history. Newest first; cap at HISTORY_CAP.
    const { data, error } = await supabase
      .from('community_insight_members')
      .select(
        `
          insight:community_insights(
            id, type, severity, is_actioned, headline, body, data_payload, created_at, expires_at
          )
        `
      )
      .eq('client_id', clientId)
      .order('insight(created_at)', { ascending: false })
      .limit(HISTORY_CAP);

    if (error) {
      logError(error, { route: 'GET /api/tribe-os/clients/[id]/insights', clientId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    // Flatten the embedded join. Each row carries one insight; a
    // null insight (RLS hid it) drops out.
    const insights: ClientInsightRow[] = (data ?? [])
      .map((row) => row.insight as unknown as ClientInsightRow | null)
      .filter((i): i is ClientInsightRow => i !== null)
      // Sort here defensively — Postgres ordering through embedded
      // joins is reliable in current Supabase but isn't guaranteed.
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    return NextResponse.json({ success: true, data: { insights } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/[id]/insights' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
