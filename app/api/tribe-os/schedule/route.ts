/**
 * GET /api/tribe-os/schedule
 *
 * Returns the caller's sessions within a date window for the
 * /os/schedule week view. Query params:
 *   from: YYYY-MM-DD (inclusive)
 *   to:   YYYY-MM-DD (inclusive)
 *
 * Defaults to "current week, Mon–Sun" if either bound is missing.
 *
 * Sessions are world-readable but we scope by creator_id so the
 * schedule shows only the caller's classes — the gym/multi-coach
 * view of "every class scheduled in this gym" lands when we promote
 * sessions to be gym-tenant aware.
 *
 * Response (200):
 *   { success: true, data: { sessions: ScheduleSession[] } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

interface ScheduleSession {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  coach_name: string | null;
  current_participants: number | null;
  max_participants: number | null;
}

/** YYYY-MM-DD for the given Date (UTC). */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Mon-of-this-week as Date (UTC). Treats Sunday as the *last* day of the week. */
function weekStartUtc(now: Date): Date {
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return start;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    const url = new URL(request.url);
    const qFrom = url.searchParams.get('from');
    const qTo = url.searchParams.get('to');

    const now = new Date();
    const start = qFrom && /^\d{4}-\d{2}-\d{2}$/.test(qFrom) ? qFrom : ymd(weekStartUtc(now));
    let end: string;
    if (qTo && /^\d{4}-\d{2}-\d{2}$/.test(qTo)) {
      end = qTo;
    } else {
      const startDate = new Date(`${start}T00:00:00.000Z`);
      const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
      end = ymd(endDate);
    }

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
          status,
          current_participants,
          max_participants,
          creator:users!sessions_creator_id_fkey(name)
        `
      )
      .eq('creator_id', userId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      logError(error, { action: 'schedule.list', userId, gymId, from: start, to: end });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    const sessions: ScheduleSession[] = (data ?? []).map((row) => {
      const creator = row.creator as unknown as { name: string | null } | null;
      return {
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        sport: (row.sport as string | null) ?? null,
        date: row.date as string,
        start_time: (row.start_time as string | null) ?? null,
        end_time: (row.end_time as string | null) ?? null,
        status: (row.status as string | null) ?? null,
        coach_name: creator?.name ?? null,
        current_participants: (row.current_participants as number | null) ?? null,
        max_participants: (row.max_participants as number | null) ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { from: start, to: end, sessions } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/schedule' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
