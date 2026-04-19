import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import {
  updateSession,
  fetchActiveSessionsForDates,
  fetchUserProfileMaybe,
  fetchParticipantsWithUserDetails,
} from '@/lib/dal';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';

// Reminder messages in both languages
const reminderMessages = {
  oneHour: {
    en: {
      title: 'Session in 1 hour!',
      body: (sport: string, location: string) => `${sport} at ${location} starts in 1 hour. Get ready!`,
    },
    es: {
      title: '¡Sesión en 1 hora!',
      body: (sport: string, location: string) => `${sport} en ${location} comienza en 1 hora. ¡Prepárate!`,
    },
  },
  fifteenMin: {
    en: {
      title: 'Session starting soon!',
      body: (sport: string, location: string) => `${sport} at ${location} starts in 15 minutes. Head out now!`,
    },
    es: {
      title: '¡La sesión empieza pronto!',
      body: (sport: string, location: string) => `${sport} en ${location} comienza en 15 minutos. ¡Sal ya!`,
    },
  },
};

/**
 * @description Sends session reminder push notifications at two intervals: 1 hour and 15 minutes before session start, to both hosts and confirmed participants.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, timestamp: string, oneHourRemindersSent: number, fifteenMinRemindersSent: number }} Counts of reminders sent at each interval.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Time windows for reminders (with 5 minute tolerance)
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const oneHourFiveMin = new Date(now.getTime() + 65 * 60 * 1000);
    const fifteenMinFromNow = new Date(now.getTime() + 15 * 60 * 1000);
    const twentyMinFromNow = new Date(now.getTime() + 20 * 60 * 1000);

    let oneHourRemindersSent = 0;
    let fifteenMinRemindersSent = 0;

    // Get all active sessions for today and tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const sessionsResult = await fetchActiveSessionsForDates(supabase, [today, tomorrowStr]);

    if (!sessionsResult.success) {
      logError(sessionsResult.error, { route: '/api/cron/session-reminders', action: 'fetch_sessions' });
      return NextResponse.json({ error: sessionsResult.error }, { status: 500 });
    }

    const sessions = sessionsResult.data;

    for (const session of sessions || []) {
      const sessionDateTime = new Date(`${session.date}T${session.start_time}`);

      // Check for 1-hour reminder
      const needsOneHourReminder =
        !session.reminder_1hr_sent && sessionDateTime >= oneHourFromNow && sessionDateTime <= oneHourFiveMin;

      // Check for 15-minute reminder
      const needsFifteenMinReminder =
        !session.reminder_15min_sent && sessionDateTime >= fifteenMinFromNow && sessionDateTime <= twentyMinFromNow;

      if (needsOneHourReminder || needsFifteenMinReminder) {
        // Fetch creator and participants in parallel (independent queries)
        const [creatorResult, participantsResult] = await Promise.all([
          fetchUserProfileMaybe(supabase, session.creator_id, 'id, preferred_language, session_reminders_enabled'),
          fetchParticipantsWithUserDetails(supabase, session.id),
        ]);
        const creator = creatorResult.data as {
          id: string;
          preferred_language: string | null;
          session_reminders_enabled: boolean | null;
        } | null;
        const participants = (participantsResult.data || []) as Array<{
          user_id: string;
          user: { id: string; preferred_language: string | null; session_reminders_enabled: boolean | null } | null;
        }>;

        // Collect all users to notify (creator + participants)
        const usersToNotify: Array<{ id: string; lang: string }> = [];

        // Add creator if reminders enabled
        if (creator && creator.session_reminders_enabled !== false) {
          usersToNotify.push({
            id: creator.id,
            lang: creator.preferred_language || 'en',
          });
        }

        // Add participants if reminders enabled
        for (const participant of participants) {
          const userData = participant.user;
          if (userData && userData.session_reminders_enabled !== false) {
            usersToNotify.push({
              id: participant.user_id,
              lang: userData.preferred_language || 'en',
            });
          }
        }

        // Respect per-category preferences (push channel, session_reminders category)
        const prefsChecks = await Promise.all(
          usersToNotify.map((u) => shouldSendNotification(supabase, u.id, 'session_reminder', 'push'))
        );
        const filteredUsersToNotify = usersToNotify.filter((_, idx) => prefsChecks[idx]);

        // Send notifications in parallel batches
        const BATCH_SIZE = 10;
        for (let i = 0; i < filteredUsersToNotify.length; i += BATCH_SIZE) {
          const batch = filteredUsersToNotify.slice(i, i + BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map((userInfo) => {
              const lang = userInfo.lang as 'en' | 'es';
              const messages = needsOneHourReminder ? reminderMessages.oneHour : reminderMessages.fifteenMin;
              const title = messages[lang]?.title || messages.en.title;
              const body = (messages[lang]?.body || messages.en.body)(session.sport, session.location);

              return fetch(`${SITE_URL}/api/notifications/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: userInfo.id,
                  title,
                  body,
                  url: `/session/${session.id}`,
                }),
              });
            })
          );
          for (let j = 0; j < results.length; j++) {
            if (results[j].status === 'fulfilled') {
              if (needsOneHourReminder) {
                oneHourRemindersSent++;
              } else {
                fifteenMinRemindersSent++;
              }
            } else {
              logError((results[j] as PromiseRejectedResult).reason, {
                route: '/api/cron/session-reminders',
                action: 'send_reminder',
                userId: batch[j].id,
                sessionId: session.id,
              });
            }
          }
        }

        // Mark reminder as sent
        if (needsOneHourReminder) {
          await updateSession(supabase, session.id, { reminder_1hr_sent: true });
        }

        if (needsFifteenMinReminder) {
          await updateSession(supabase, session.id, { reminder_15min_sent: true });
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      oneHourRemindersSent,
      fifteenMinRemindersSent,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/cron/session-reminders', action: 'session_reminders_cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
