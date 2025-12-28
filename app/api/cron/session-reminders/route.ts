import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Reminder messages in both languages
const reminderMessages = {
  oneHour: {
    en: {
      title: 'Session in 1 hour!',
      body: (sport: string, location: string) => `${sport} at ${location} starts in 1 hour. Get ready!`
    },
    es: {
      title: '¡Sesión en 1 hora!',
      body: (sport: string, location: string) => `${sport} en ${location} comienza en 1 hora. ¡Prepárate!`
    }
  },
  fifteenMin: {
    en: {
      title: 'Session starting soon!',
      body: (sport: string, location: string) => `${sport} at ${location} starts in 15 minutes. Head out now!`
    },
    es: {
      title: '¡La sesión empieza pronto!',
      body: (sport: string, location: string) => `${sport} en ${location} comienza en 15 minutos. ¡Sal ya!`
    }
  }
};

export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
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

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'active')
      .in('date', [today, tomorrowStr]);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }

    for (const session of sessions || []) {
      const sessionDateTime = new Date(`${session.date}T${session.start_time}`);

      // Check for 1-hour reminder
      const needsOneHourReminder =
        !session.reminder_1hr_sent &&
        sessionDateTime >= oneHourFromNow &&
        sessionDateTime <= oneHourFiveMin;

      // Check for 15-minute reminder
      const needsFifteenMinReminder =
        !session.reminder_15min_sent &&
        sessionDateTime >= fifteenMinFromNow &&
        sessionDateTime <= twentyMinFromNow;

      if (needsOneHourReminder || needsFifteenMinReminder) {
        // Get session creator
        const { data: creator } = await supabase
          .from('users')
          .select('id, preferred_language, session_reminders_enabled')
          .eq('id', session.creator_id)
          .single();

        // Get all confirmed participants
        const { data: participants } = await supabase
          .from('session_participants')
          .select(`
            user_id,
            user:users!session_participants_user_id_fkey(id, preferred_language, session_reminders_enabled)
          `)
          .eq('session_id', session.id)
          .eq('status', 'confirmed');

        // Collect all users to notify (creator + participants)
        const usersToNotify: Array<{ id: string; lang: string }> = [];

        // Add creator if reminders enabled
        if (creator && creator.session_reminders_enabled !== false) {
          usersToNotify.push({
            id: creator.id,
            lang: creator.preferred_language || 'en'
          });
        }

        // Add participants if reminders enabled
        for (const participant of participants || []) {
          const userData = (participant as any).user;
          if (userData && userData.session_reminders_enabled !== false) {
            usersToNotify.push({
              id: participant.user_id,
              lang: userData.preferred_language || 'en'
            });
          }
        }

        // Send notifications
        for (const userInfo of usersToNotify) {
          const lang = userInfo.lang as 'en' | 'es';
          const messages = needsOneHourReminder
            ? reminderMessages.oneHour
            : reminderMessages.fifteenMin;

          const title = messages[lang]?.title || messages.en.title;
          const body = (messages[lang]?.body || messages.en.body)(session.sport, session.location);

          try {
            await fetch(`${SITE_URL}/api/notifications/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: userInfo.id,
                title,
                body,
                url: `/session/${session.id}`
              })
            });

            if (needsOneHourReminder) {
              oneHourRemindersSent++;
            } else {
              fifteenMinRemindersSent++;
            }
          } catch (err) {
            console.error(`Failed to send reminder to user ${userInfo.id}:`, err);
          }
        }

        // Mark reminder as sent
        if (needsOneHourReminder) {
          await supabase
            .from('sessions')
            .update({ reminder_1hr_sent: true })
            .eq('id', session.id);
        }

        if (needsFifteenMinReminder) {
          await supabase
            .from('sessions')
            .update({ reminder_15min_sent: true })
            .eq('id', session.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      oneHourRemindersSent,
      fifteenMinRemindersSent
    });

  } catch (error: any) {
    console.error('Session reminders cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
