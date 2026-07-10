import { getServiceRoleClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { isValidCronAuth } from '@/lib/auth/cron';
import { bogotaToday } from '@/lib/time/bogotaDate';
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
    if (!isValidCronAuth(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Backend batch cron: service-role. As an anon cron it read a dead creator
    // email embed (fetchSessionsWithCreator) that the T-SEC5 revoke would break;
    // service-role is the correct level and matches /api/cron/session-reminders.
    const supabase = getServiceRoleClient();

    // Get sessions that ended in the last 2 hours and haven't sent follow-ups
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const sessionsResult = await fetchSessionsWithCreator(supabase, {
      followup_sent: false,
      // T0-9: session.date is Bogota-local; the UTC date dropped a day's worth
      // of just-ended evening sessions for ~5h each night.
      dateLte: bogotaToday(now),
    });

    if (!sessionsResult.success) throw new Error(sessionsResult.error);

    const sessions = (sessionsResult.data || []) as Array<{
      id: string;
      sport: string;
      location: string;
      date: string;
      start_time: string;
      duration: number;
      creator: { id: string; name: string; preferred_language: string | null } | null;
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
      // Log a failed attendance read rather than silently treating it as "no
      // attendees"; skip this session but keep the batch going.
      if (!attendanceResult.success) {
        logError(attendanceResult.error, { action: 'post_session_followups.attendance', sessionId: session.id });
        continue;
      }
      const attendees = (attendanceResult.data || []).filter((a) => a.attended);

      if (attendees.length === 0) continue;

      // Send emails in parallel batches of 10 to avoid overwhelming the API.
      // T2-4: track failures so a failed send doesn't mark the follow-up sent.
      let anySendFailed = false;
      const BATCH_SIZE = 10;
      for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
        const batch = attendees.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((attendee) =>
            fetch(`${process.env.NEXT_PUBLIC_SITE_URL!}/api/send-attendance-notification`, {
              method: 'POST',
              // This is a server-to-server call with no session cookie; it must
              // authenticate via CRON_SECRET (the endpoint accepts cron OR
              // session auth).
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.CRON_SECRET}`,
              },
              body: JSON.stringify({
                sessionId: session.id,
                userId: attendee.user_id,
              }),
            })
          )
        );
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          // A fetch that RESOLVES with a non-2xx is not a successful send —
          // check res.ok, not just "fulfilled". (T2-4)
          if (result.status === 'fulfilled' && result.value.ok) {
            sentCount++;
          } else {
            anySendFailed = true;
            logError(
              result.status === 'rejected'
                ? (result as PromiseRejectedResult).reason
                : new Error(`send-attendance-notification returned ${result.value.status}`),
              {
                route: '/api/cron/post-session-followups',
                action: 'send_followup_email',
                sessionId: session.id,
                userId: batch[j].user_id,
              }
            );
          }
        }
      }

      // Mark follow-up as sent — only if every email was accepted, so a failed
      // send doesn't permanently suppress the follow-up (T2-4). On failure the
      // flag stays unset and the next run retries.
      if (!anySendFailed) {
        await updateSession(supabase, session.id, { followup_sent: true });
      }
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
