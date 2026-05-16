/**
 * GET /api/tribe-os/dashboard/recent-activity
 *
 * Returns the most recent gym activity as a discriminated stream of
 * two event kinds:
 *
 *   - 'attendance' — a client_attendance row (someone showed up,
 *     paid, or didn't show). Built from client_attendance with the
 *     normal RLS-scoped read.
 *   - 'insight'    — a community_insights card (the AI flagged
 *     something). Active + un-dismissed only — once a coach dismisses
 *     an insight it falls off the feed.
 *
 * Both streams are queried in parallel, merged by created_at desc,
 * and capped at the requested `limit`. Powers the "Recent activity"
 * widget on /os/dashboard so the coach lands on the page and sees
 * one unified timeline of "what's happened in my gym" — attendance
 * + AI signals interleaved by time.
 *
 * Why merge in the API instead of two widgets: a single feed reads
 * the way coaches actually think about their gym ("Anna showed up,
 * Carlos got flagged at-risk, the 5pm class filled up"). Two parallel
 * widgets would force the coach to context-switch between them and
 * lose the temporal narrative.
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

/** Attendance event in the merged feed. */
interface AttendanceActivityItem {
  kind: 'attendance';
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

/** AI insight event in the merged feed. */
interface InsightActivityItem {
  kind: 'insight';
  id: string;
  insight_type: 'CHURN_RISK' | 'RETENTION_OPP' | 'REVENUE' | 'GROWTH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Persisted English headline — used as fallback when no i18n
   * template is embedded in data_payload. */
  headline: string;
  /** Raw data_payload — the client uses the embedded template (if
   * present) to render headline copy in the caller's language at
   * display time. Falls back to `headline` when missing. */
  data_payload: unknown;
  /** Primary subject of the insight when it targets exactly one
   * client — lets the widget link directly into that member detail
   * instead of bouncing through /os/intelligence first. */
  primary_member_id: string | null;
  primary_member_name: string | null;
  /** Total clients this insight references, including the primary. */
  member_count: number;
  created_at: string;
}

export type RecentActivityItem = AttendanceActivityItem | InsightActivityItem;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const rawLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

    // Fetch both streams in parallel. Each pulls up to `limit` rows
    // so the merge step has enough headroom — worst case we'll need
    // exactly `limit` from one stream if the other is empty.
    const nowIso = new Date().toISOString();
    const [attendanceRes, insightsRes] = await Promise.all([
      // Attendance: RLS scopes to the caller's gym (dual-path policy
      // from migration 070), so no explicit gym filter here.
      supabase
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
        .limit(limit),
      // Insights: only active (not expired) and not yet dismissed.
      // Dismissals drop the card off the activity feed permanently
      // — once the coach has actioned a signal we don't keep
      // surfacing it as "recent activity."
      supabase
        .from('community_insights')
        .select(
          `
            id, type, severity, headline, data_payload, created_at,
            members:community_insight_members(
              client:clients(id, name)
            )
          `
        )
        .eq('is_actioned', false)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    if (attendanceRes.error) {
      logError(attendanceRes.error, { action: 'dashboard.recent_activity.attendance', userId, gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }
    if (insightsRes.error) {
      // Don't fail the whole feed on an insight-side error — the
      // attendance stream is still useful on its own. Log and
      // proceed with an empty insights array.
      logError(insightsRes.error, { action: 'dashboard.recent_activity.insights', userId, gymId });
    }

    const attendanceItems: AttendanceActivityItem[] = (attendanceRes.data ?? []).map((row) => {
      const client = row.client as unknown as { id: string; name: string | null } | null;
      const session = row.session as unknown as { id: string; title: string | null; sport: string | null } | null;
      return {
        kind: 'attendance',
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

    const insightItems: InsightActivityItem[] = (insightsRes.data ?? []).map((row) => {
      // Member join can come back as either a plain array or null;
      // pick the first member as the "primary subject" for nav
      // purposes. Insights that target zero members or several
      // members get linked to /os/intelligence by the widget instead.
      const memberRows =
        (row.members as unknown as Array<{ client: { id: string; name: string } | null }> | null) ?? [];
      const validMembers = memberRows.filter((m) => m.client !== null);
      const primary = validMembers[0]?.client ?? null;
      return {
        kind: 'insight',
        id: row.id as string,
        insight_type: row.type as InsightActivityItem['insight_type'],
        severity: row.severity as InsightActivityItem['severity'],
        headline: row.headline as string,
        data_payload: row.data_payload ?? null,
        primary_member_id: primary?.id ?? null,
        primary_member_name: primary?.name ?? null,
        member_count: validMembers.length,
        created_at: row.created_at as string,
      };
    });

    // Merge + sort by created_at desc, then cap at `limit`. Using
    // the row's created_at (not attended_at) so the two streams
    // compare on a consistent field — attended_at can be null and
    // we want a stable ordering.
    const merged: RecentActivityItem[] = [...attendanceItems, ...insightItems]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);

    return NextResponse.json({ success: true, data: { activity: merged } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/recent-activity' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
