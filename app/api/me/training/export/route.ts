/**
 * GET /api/me/training/export
 *
 * Member-facing data export — the right-to-access complement to the
 * GDPR purge endpoint at POST /api/tribe-os/clients/[id]/purge.
 *
 * Returns the signed-in user's full training data across every gym
 * they belong to as a JSON download. Includes:
 *   - Identity (name, status, archived flag) per gym
 *   - Cached counters (sessions, streak, etc.)
 *   - Full attendance history (no cap — exports are meant to be complete)
 *   - Full partner list
 *
 * Why JSON instead of CSV: the shape is nested (gym → attendance →
 * session) and CSV would force a flat join that loses structure. A
 * JSON file opens in any text editor and round-trips through any
 * data-export tool the user might run it through.
 *
 * Auth:
 *   - Requires a signed-in Tribe user
 *   - The DAL re-validates email match against clients.email — the
 *     standard /api/me/* identity-gate pattern
 *
 * Response: application/json with Content-Disposition: attachment, so
 * the browser saves the file rather than rendering it. Filename
 * includes the date for easy archival.
 */

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logError, log } from '@/lib/logger';
import { buildMyDataExport } from '@/lib/dal/memberSelf';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const result = await buildMyDataExport(user.email);
    if (!result.success || !result.data) {
      logError(new Error(result.error ?? 'unknown'), { route: 'GET /api/me/training/export', userId: user.id });
      return NextResponse.json({ success: false, error: result.error ?? 'export_failed' }, { status: 500 });
    }

    // Forensic breadcrumb. Members exporting their own data is benign
    // but logging it is cheap insurance — if a token were ever stolen
    // and used to dump a member's data, the access shows up here.
    log('info', 'tribe_member_data_exported', {
      action: 'memberDataExport',
      actorUserId: user.id,
      memberships: result.data.memberships.length,
      attendance_rows: result.data.memberships.reduce((n, m) => n + m.attendance.length, 0),
    });

    // Build a date-stamped filename. We deliberately pick UTC date
    // rather than the user's local — exports are server-generated,
    // so server-side time is the more honest stamp.
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `tribe-training-data-${datePart}.json`;

    return new NextResponse(JSON.stringify(result.data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Don't cache — the response varies per user and includes
        // personal data. Stale caches would be both wrong and a
        // privacy hazard.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/me/training/export' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
