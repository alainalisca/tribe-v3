import { createClient } from '@/lib/supabase/client';
import { fetchParticipationsWithSession } from '@/lib/dal';
import { notificationCopy, type NotificationLang } from '@/lib/notification-i18n';
import { translateSport } from '@/lib/sportTranslationData';

/** The reminder's text, in the language of the person on this device. */
export function sessionReminderCopy(
  session: { sport: string | null; location: string | null },
  language: NotificationLang
): { title: string; body: string } {
  return notificationCopy('session_reminder_local', language, {
    sport: translateSport(session.sport, language),
    location: session.location ?? '',
  });
}

/**
 * Local browser reminders, one hour before each session joined today or
 * tomorrow. `language` is the app's current language: the reader is the
 * person holding this device.
 */
export async function scheduleSessionReminders(language: NotificationLang = 'es') {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Get user's joined sessions for today and tomorrow
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const joinedResult = await fetchParticipationsWithSession(supabase, user.id, {
    status: 'confirmed',
    dateGte: today.toISOString().split('T')[0],
    dateLte: tomorrow.toISOString().split('T')[0],
    userJoinFields: 'session_id, sessions:session_id(id, sport, date, start_time, location)',
  });

  const joinedSessions = joinedResult.data as
    | Array<{
        session_id: string;
        sessions:
          | { id: string; sport: string; date: string; start_time: string; location: string }
          | { id: string; sport: string; date: string; start_time: string; location: string }[]
          | null;
      }>
    | undefined;

  if (!joinedSessions) return;

  // Schedule notifications for each session (1 hour before)
  joinedSessions.forEach((row) => {
    const rawSession = row.sessions;
    const session = (Array.isArray(rawSession) ? rawSession[0] : rawSession) as {
      id: string;
      sport: string;
      date: string;
      start_time: string;
      location: string;
    } | null;
    if (!session) return;

    const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
    const reminderTime = new Date(sessionDateTime.getTime() - 60 * 60 * 1000); // 1 hour before
    const now = new Date();

    if (reminderTime > now) {
      const timeUntilReminder = reminderTime.getTime() - now.getTime();

      setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'granted') {
          const { title, body } = sessionReminderCopy(session, language);
          new Notification(title, {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
          });
        }
      }, timeUntilReminder);
    }
  });
}
