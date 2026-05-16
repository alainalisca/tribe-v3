/**
 * POST /api/tribe-os/intelligence/[id]/dismiss
 *
 * Marks a community_insight as actioned (dismissed). RLS gates the
 * UPDATE to gym members — no extra owner check needed since any
 * coach can dismiss.
 *
 * Response (200): { success: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { actionInsight } from '@/lib/dal/communityInsights';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: insightId } = await params;
    if (!insightId) {
      return NextResponse.json({ success: false, error: 'insight_id_required' }, { status: 400 });
    }

    const result = await actionInsight(supabase, insightId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'dismiss_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/intelligence/[id]/dismiss' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
