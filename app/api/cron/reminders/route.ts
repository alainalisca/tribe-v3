import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRandomMessage, getMessageContent } from '@/lib/motivational-messages';
import { logError } from '@/lib/logger';
import {
  updateSession,
  updateUser,
  fetchSessionsWithCreator,
  fetchParticipantsWithUserDetails,
  fetchUsersWithPush,
} from '@/lib/dal';
import type { SessionWithCreator } from '@/lib/dal/types';

// Colombia timezone offset (UTC-5)
const COLOMBIA_TZ_OFFSET = -5;

function getColombiaHour(): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  let colombiaHour = utcHour + COLOMBIA_TZ_OFFSET;
  if (colombiaHour < 0) colombiaHour += 24;
  if (colombiaHour >= 24) colombiaHour -= 24;
  return colombiaHour;
}

function isMorningWindow(): boolean {
  const hour = getColombiaHour();
  // 8 AM window (7:45 - 8:15 AM Colombia time)
  return hour === 8;
}

/**
 * @description Sends session reminder push notifications 2 hours before start to hosts and participants, and sends morning motivational messages at 8 AM Colombia time to active users.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, colombiaHour: number, isMorningWindow: boolean, sessionReminders: number, morningMotivation: number }} Counts of reminders and motivational messages sent.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;
    const colombiaHour = getColombiaHour();

    // 1. SEND SESSION REMINDERS (2 hours before)
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursFifteenMinsFromNow = new Date(now.getTime() + 2.25 * 60 * 60 * 1000);

    const sessionsResult = await fetchSessionsWithCreator(supabase, {
      status: 'active',
      reminder_sent: false,
      dateGte: now.toISOString().split('T')[0],
      dateLte: twoHoursFifteenMinsFromNow.toISOString().split('T')[0],
    });
    const sessions = sessionsResult.data as SessionWithCreator[] | null;

    let remindersSent = 0;

    if (sessions && sessions.length > 0) {
      const sessionsToRemind = sessions.filter((session) => {
        const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
        return sessionDateTime >= twoHoursFromNow && sessionDateTime <= twoHoursFifteenMinsFromNow;
      });

      for (const session of sessionsToRemind) {
        const participantsResult = await fetchParticipantsWithUserDetails(
          supabase,
          session.id,
          'id, name, email, preferred_language'
        );
        const participants = (participantsResult.data || []) as Array<{
          user_id: string;
          user: { id: string; name: string; email: string; preferred_language: string | null } | null;
        }>;

        if (session.creator) {
          const hostLang = session.creator.preferred_language || 'en';
          const hostTitle = hostLang === 'es' ? '¡Tu sesión comienza pronto!' : 'Your session starts soon!';
          const hostBody =
            hostLang === 'es'
              ? `${session.sport} comienza en 2 horas en ${session.location}`
              : `${session.sport} starts in 2 hours at ${session.location}`;

          await fetch(`${SITE_URL}/api/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: session.creator.id,
              title: hostTitle,
              body: hostBody,
              url: `/session/${session.id}`,
            }),
          });
        }

        for (const participant of participants) {
          const pLang = participant.user?.preferred_language || 'en';
          const pTitle = pLang === 'es' ? '¡Tu sesión comienza pronto!' : 'Session starting soon!';
          const pBody =
            pLang === 'es'
              ? `${session.sport} comienza en 2 horas. ¡Nunca entrenes solo!`
              : `${session.sport} starts in 2 hours. Never train alone!`;

          await fetch(`${SITE_URL}/api/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: participant.user_id,
              title: pTitle,
              body: pBody,
              url: `/session/${session.id}`,
            }),
          });
        }

        await updateSession(supabase, session.id, { reminder_sent: true });

        remindersSent++;
      }
    }

    // 2. SEND MORNING MOTIVATION (8 AM Colombia time)
    let morningMotivationSent = 0;

    if (isMorningWindow()) {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get users who:
      // - Have push notifications enabled
      // - Haven't received morning motivation today
      // - Have been active in the last 30 days
      const usersResult = await fetchUsersWithPush(
        supabase,
        'id, preferred_language, push_subscription, last_motivation_sent, last_motivation_message_id, updated_at',
        { lastMotivationBefore: today, updatedAfter: thirtyDaysAgo }
      );
      const users = (usersResult.data || []) as Array<{
        id: string;
        preferred_language: string | null;
        push_subscription: unknown;
        last_motivation_sent: string | null;
        last_motivation_message_id: string | null;
        updated_at: string;
      }>;

      if (users && users.length > 0) {
        for (const user of users) {
          // Parse previously used message IDs to avoid repeats
          let usedMessageIds: number[] = [];
          if (user.last_motivation_message_id) {
            try {
              usedMessageIds = JSON.parse(user.last_motivation_message_id);
              // Keep only the last 15 message IDs to allow cycling
              if (usedMessageIds.length > 15) {
                usedMessageIds = usedMessageIds.slice(-15);
              }
            } catch {
              usedMessageIds = [];
            }
          }

          // Get a random morning motivation message, avoiding recently sent ones
          const { message, index } = getRandomMessage('morning_motivation', usedMessageIds);
          const lang = (user.preferred_language || 'en') as 'en' | 'es';
          const content = getMessageContent(message, lang);

          try {
            await fetch(`${SITE_URL}/api/notifications/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                title: content.title,
                body: content.body,
                url: '/',
              }),
            });

            // Update tracking: add new message ID and update timestamp
            const newUsedIds = [...usedMessageIds, index];
            await updateUser(supabase, user.id, {
              last_motivation_sent: new Date().toISOString(),
              last_motivation_message_id: JSON.stringify(newUsedIds),
            });

            morningMotivationSent++;
          } catch (err) {
            logError(err, { route: '/api/cron/reminders', action: 'send_morning_motivation', userId: user.id });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      colombiaHour,
      isMorningWindow: isMorningWindow(),
      sessionReminders: remindersSent,
      morningMotivation: morningMotivationSent,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/cron/reminders', action: 'reminders_cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
