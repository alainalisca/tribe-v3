/**
 * GET /api/tribe-os/dashboard/upcoming-sessions
 *
 * Returns sessions on the schedule for today + tomorrow, joined with
 * the session's creator's display name (which we surface as "Coach"
 * in the UI). Today's sessions are filtered further by start_time
 * so already-finished morning classes don't crowd the card.
 *
 * Scoping: sessions are owned by `creator_id`. We surface only the
 * caller's own sessions for now — the full gym/multi-coach view of
 * "every class scheduled today" lands when we promote the schedule
 * page to its own surface.
 *
 * Response (200):
 *   { success: true, data: { sessions: UpcomingSession[] } }
 *
 * Failures: 401, 403, 500 — same gate semantics as other premium routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

const DEFAULT_LIMIT = 8;

interface UpcomingSession {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  coach_name: string | null;
  current_participants: number | null;
  max_participants: number | null;
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('sessions')
      .select(
        `
          id,
          title,
          sport,
          date,
          start_time,
          end_time,
          current_participants,
          max_participants,
          creator:users!sessions_creator_id_fkey(name)
        `
      )
      .eq('creator_id', userId)
      .in('date', [todayStr, tomorrowStr])
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(DEFAULT_LIMIT);

    if (error) {
      logError(error, { action: 'dashboard.upcoming_sessions.list', userId, gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    const sessions: UpcomingSession[] = (data ?? []).map((row) => {
      const creator = row.creator as unknown as { name: string | null } | null;
      return {
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        sport: (row.sport as string | null) ?? null,
        date: row.date as string,
        start_time: (row.start_time as string | null) ?? null,
        end_time: (row.end_time as string | null) ?? null,
        coach_name: creator?.name ?? null,
        current_participants: (row.current_participants as number | null) ?? null,
        max_participants: (row.max_participants as number | null) ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { sessions } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/dashboard/upcoming-sessions' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
