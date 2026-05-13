/**
 * GET /api/tribe-os/dashboard/recent-activity
 *
 * Returns the most recent attendance events for the caller's gym
 * (or instructor, on the legacy path). Powers the "Recent activity"
 * card on /os/dashboard so an instructor can see at a glance the
 * last things that happened in their gym: who showed up, when, and
 * whether they paid.
 *
 * Source: client_attendance rows ordered by attended_at desc (with
 * created_at as the tie-breaker). RLS on client_attendance does the
 * tenant scoping via the dual-path policy from migration 070, so
 * the query itself has no extra .eq() filters — RLS guarantees only
 * the caller's gym's rows come back.
 *
 * Response (200):
 *   { success: true, data: { activity: RecentActivityItem[] } }
 *
 * Failures: 401, 403, 500 — same gate semantics as other premium routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

interface RecentActivityItem {
  id: string;
  client_id: string;
  client_name: string | null;
  session_id: string;
  session_title: string | null;
  session_sport: string | null;
  attended: boolean;
  paid: boolean;
  attended_at: string | null;
  amount_paid_cents: number | null;
  currency: string | null;
  created_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

    // RLS scopes the rows to the caller's gym (dual-path policy).
    // We sort by attended_at desc primarily — most recent check-in
    // wins — falling back to created_at when attended_at is null
    // (a row recorded as "no show" or "paid but not attended" may
    // not have an attended_at).
    const { data, error } = await supabase
      .from('client_attendance')
      .select(
        `
          id,
          client_id,
          session_id,
          attended,
          paid,
          attended_at,
          amount_paid_cents,
          currency,
          created_at,
          client:clients(id, name),
          session:sessions(id, title, sport)
        `
      )
      .order('attended_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logError(error, { action: 'dashboard.recent_activity.list', userId, gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    const activity: RecentActivityItem[] = (data ?? []).map((row) => {
      // Supabase typegen renders the embedded relations as objects
      // here even though the cardinality is 1:1 — the cast lets us
      // read .name and .title without fighting the inferred shape.
      const client = row.client as unknown as { id: string; name: string | null } | null;
      const session = row.session as unknown as { id: string; title: string | null; sport: string | null } | null;
      return {
        id: row.id,
        client_id: row.client_id,
        client_name: client?.name ?? null,
        session_id: row.session_id,
        session_title: session?.title ?? null,
        session_sport: session?.sport ?? null,
        attended: row.attended,
        paid: row.paid,
        attended_at: row.attended_at,
        amount_paid_cents: row.amount_paid_cents,
        currency: row.currency,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({ success: true, data: { activity } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/recent-activity' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
