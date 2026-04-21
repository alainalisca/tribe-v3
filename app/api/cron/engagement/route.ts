import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRandomMessage, getMessageContent, replaceMessageVariables } from '@/lib/motivational-messages';
import { log, logError } from '@/lib/logger';
import {
  updateUser,
  fetchUsersWithPush,
  fetchParticipationsWithSession,
  fetchSessionsByCreator,
  fetchActiveSessionCount,
} from '@/lib/dal';

// Colombia timezone offset (UTC-5)
const COLOMBIA_TZ_OFFSET = -5;

function getColombiaTime(): { hour: number; dayOfWeek: number } {
  const now = new Date();
  // Get Colombia time
  const colombiaTime = new Date(
    now.getTime() + COLOMBIA_TZ_OFFSET * 60 * 60 * 1000 - now.getTimezoneOffset() * 60 * 1000
  );
  return {
    hour: colombiaTime.getUTCHours(),
    dayOfWeek: colombiaTime.getUTCDay(), // 0 = Sunday
  };
}

function isSundayEveningWindow(): boolean {
  const { hour, dayOfWeek } = getColombiaTime();
  // Sunday (0) at 6 PM (18:00) Colombia time
  return dayOfWeek === 0 && hour === 18;
}

/**
 * @description Handles two engagement tasks based on Colombia timezone: (1) weekly recap push notifications on Sunday evenings, and (2) re-engagement notifications for users inactive 3+ days.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, colombiaTime: Object, isSundayEvening: boolean, weeklyRecapsSent: number, reEngagementsSent: number }} Counts of notifications sent per category.
 */
export async function GET(request: Request) {
  // LR-05: structured run logging so Vercel logs surface every cron execution.
  // `cron_start` fires immediately; `cron_complete` on success carries counts
  // + duration; `cron_failed` fires from the catch block with duration.
  const route = 'cron:engagement';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;
    const now = new Date();
    const { hour, dayOfWeek } = getColombiaTime();

    let weeklyRecapsSent = 0;
    let reEngagementsSent = 0;

    // 1. WEEKLY RECAP (Sundays at 6 PM Colombia time)
    if (isSundayEveningWindow()) {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const today = now.toISOString().split('T')[0];

      // Get users with push subscriptions who haven't received weekly recap today
      const usersResult = await fetchUsersWithPush(
        supabase,
        'id, preferred_language, push_subscription, last_weekly_recap_sent',
        { lastWeeklyRecapBefore: today }
      );
      const users = (usersResult.data || []) as Array<{
        id: string;
        preferred_language: string | null;
        push_subscription: unknown;
        last_weekly_recap_sent: string | null;
      }>;

      if (users.length > 0) {
        for (const user of users) {
          // Fetch participation and hosted sessions in parallel (independent queries)
          const [participationsResult, hostedResult] = await Promise.all([
            fetchParticipationsWithSession(supabase, user.id, {
              status: 'confirmed',
              dateGte: oneWeekAgo.toISOString().split('T')[0],
              dateLte: today,
            }),
            fetchSessionsByCreator(supabase, user.id, {
              dateGte: oneWeekAgo.toISOString().split('T')[0],
              dateLte: today,
              fields: 'id, date, sport, duration, current_participants',
            }),
          ]);
          const participations = (participationsResult.data || []) as Array<{
            session_id: string;
            sessions: { date: string; sport: string; duration: number | null } | null;
          }>;
          const hostedSessions = (hostedResult.data || []) as Array<{
            id: string;
            date: string;
            sport: string;
            duration: number | null;
            current_participants: number | null;
          }>;

          const sessionsJoined = participations.length;
          const sessionsHosted = hostedSessions.length;
          const totalSessions = sessionsJoined + sessionsHosted;

          // Calculate total training hours
          let totalMinutes = 0;
          participations.forEach((p) => {
            totalMinutes += p.sessions?.duration || 0;
          });
          hostedSessions.forEach((s) => {
            totalMinutes += s.duration || 0;
          });
          const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

          // Calculate how many people the user helped (attendees at their hosted sessions)
          let peopleHelped = 0;
          hostedSessions.forEach((s) => {
            peopleHelped += (s.current_participants || 1) - 1; // Exclude host
          });

          const lang = (user.preferred_language || 'en') as 'en' | 'es';
          const { message } = getRandomMessage('weekly_recap');
          let content = getMessageContent(message, lang);

          // Replace variables based on user's activity
          content = replaceMessageVariables(content, {
            count: totalSessions,
            sessions: totalSessions,
            hours: totalHours,
            partners: sessionsJoined,
            others: peopleHelped,
            next_goal: totalSessions + 1,
            streak: totalSessions > 0 ? totalSessions : 1,
            new_connections: sessionsJoined,
          });

          try {
            await fetch(`${SITE_URL}/api/notifications/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                title: content.title,
                body: content.body,
                url: '/sessions',
              }),
            });

            await updateUser(supabase, user.id, { last_weekly_recap_sent: new Date().toISOString() });

            weeklyRecapsSent++;
          } catch (err) {
            logError(err, { route: '/api/cron/engagement', action: 'send_weekly_recap', userId: user.id });
          }
        }
      }
    }

    // 2. RE-ENGAGEMENT (Users inactive for 3+ days)
    // Run this check every time the cron runs, but only send once per 3 days to inactive users
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Get users who:
    // - Have push subscriptions
    // - Haven't been active in 3+ days
    // - Haven't received re-engagement notification in the past 3 days
    // - But were active within the last 60 days (not completely churned)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const inactiveUsersResult = await fetchUsersWithPush(
      supabase,
      'id, preferred_language, push_subscription, updated_at, last_reengagement_sent',
      {
        updatedBefore: threeDaysAgo.toISOString(),
        updatedAfter: sixtyDaysAgo.toISOString(),
        lastReengagementBefore: threeDaysAgo.toISOString(),
      }
    );
    const inactiveUsers = (inactiveUsersResult.data || []) as Array<{
      id: string;
      preferred_language: string | null;
      push_subscription: unknown;
      updated_at: string;
      last_reengagement_sent: string | null;
    }>;

    const pendingReEngagements: Array<{ userId: string; title: string; body: string }> = [];

    if (inactiveUsers.length > 0) {
      // Count available sessions in the system
      const sessionCountResult = await fetchActiveSessionCount(supabase, now.toISOString().split('T')[0]);
      const availableSessions = sessionCountResult.data ?? 0;

      for (const user of inactiveUsers) {
        // Calculate days since last activity
        const lastActive = new Date(user.updated_at);
        const daysSinceActive = Math.floor((now.getTime() - lastActive.getTime()) / (24 * 60 * 60 * 1000));

        const lang = (user.preferred_language || 'en') as 'en' | 'es';
        const { message } = getRandomMessage('re_engagement');
        let content = getMessageContent(message, lang);

        // Replace variables
        content = replaceMessageVariables(content, {
          days: daysSinceActive,
          count: availableSessions,
        });

        pendingReEngagements.push({ userId: user.id, title: content.title, body: content.body });
      }
    }

    // Send re-engagement notifications in parallel batches
    const BATCH_SIZE = 25;
    for (let i = 0; i < pendingReEngagements.length; i += BATCH_SIZE) {
      const batch = pendingReEngagements.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          await fetch(`${SITE_URL}/api/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: item.userId,
              title: item.title,
              body: item.body,
              url: '/',
            }),
          });
          await updateUser(supabase, item.userId, { last_reengagement_sent: new Date().toISOString() });
        })
      );
      reEngagementsSent += results.filter((r) => r.status === 'fulfilled').length;
    }

    const duration_ms = Date.now() - startedAt;
    log('info', 'cron_complete', {
      action: 'cron_complete',
      route,
      duration_ms,
      weeklyRecapsSent,
      reEngagementsSent,
    });

    return NextResponse.json({
      ok: true,
      route,
      duration_ms,
      colombiaTime: { hour, dayOfWeek },
      isSundayEvening: isSundayEveningWindow(),
      weeklyRecapsSent,
      reEngagementsSent,
    });
  } catch (error: unknown) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { route, action: 'cron_failed', duration_ms });
    return NextResponse.json({ ok: false, route, error: 'Internal server error' }, { status: 500 });
  }
}
