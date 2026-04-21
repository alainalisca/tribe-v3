import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { log, logError } from '@/lib/logger';
import { updateSession, fetchSessionsWithCreator, fetchSessionAttendance } from '@/lib/dal';

/**
 * @description Sends post-session follow-up emails to attendees of sessions that ended within the last 2 hours, prompting them to share photos.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, message: string, count: number }} Number of follow-up emails sent and sessions processed.
 */
export async function GET(request: Request) {
  // LR-05: structured run logging.
  const route = 'cron:post-session-followups';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    // Verify this is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get sessions that ended in the last 2 hours and haven't sent follow-ups
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const sessionsResult = await fetchSessionsWithCreator(supabase, {
      followup_sent: false,
      dateLte: now.toISOString().split('T')[0],
    });

    if (!sessionsResult.success) throw new Error(sessionsResult.error);

    const sessions = (sessionsResult.data || []) as Array<{
      id: string;
      sport: string;
      location: string;
      date: string;
      start_time: string;
      duration: number;
      creator: { id: string; name: string; email: string; preferred_language: string | null } | null;
    }>;

    if (sessions.length === 0) {
      const duration_ms = Date.now() - startedAt;
      log('info', 'cron_complete', { action: 'cron_complete', route, duration_ms, count: 0, skipped: 'no_sessions' });
      return NextResponse.json({ ok: true, route, duration_ms, message: 'No sessions need follow-ups', count: 0 });
    }

    // Filter for sessions that actually ended
    const endedSessions = sessions.filter((session) => {
      const sessionStart = new Date(`${session.date}T${session.start_time}`);
      const sessionEnd = new Date(sessionStart.getTime() + session.duration * 60 * 1000);
      return sessionEnd <= now && sessionEnd >= twoHoursAgo;
    });

    let sentCount = 0;

    // Send follow-up emails to participants who attended
    for (const session of endedSessions) {
      const attendanceResult = await fetchSessionAttendance(supabase, session.id);
      const attendees = (attendanceResult.data || []).filter((a) => a.attended);

      if (attendees.length === 0) continue;

      // Send emails in parallel batches of 10 to avoid overwhelming the API
      const BATCH_SIZE = 10;
      for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
        const batch = attendees.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((attendee) =>
            fetch(`${process.env.NEXT_PUBLIC_SITE_URL!}/api/send-attendance-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: session.id,
                userId: attendee.user_id,
              }),
            })
          )
        );
        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'fulfilled') {
            sentCount++;
          } else {
            logError((results[j] as PromiseRejectedResult).reason, {
              route: '/api/cron/post-session-followups',
              action: 'send_followup_email',
              sessionId: session.id,
              userId: batch[j].user_id,
            });
          }
        }
      }

      // Mark follow-up as sent
      await updateSession(supabase, session.id, { followup_sent: true });
    }

    const duration_ms = Date.now() - startedAt;
    log('info', 'cron_complete', {
      action: 'cron_complete',
      route,
      duration_ms,
      count: sentCount,
      sessionsProcessed: endedSessions.length,
    });
    return NextResponse.json({
      ok: true,
      route,
      duration_ms,
      message: `Sent ${sentCount} follow-up emails for ${endedSessions.length} sessions`,
      count: sentCount,
    });
  } catch (error: unknown) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { action: 'cron_failed', route, duration_ms });
    return NextResponse.json({ ok: false, route, error: 'Internal server error' }, { status: 500 });
  }
}
