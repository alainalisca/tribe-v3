import { createClient } from '@/lib/supabase/client';

export async function scheduleSessionReminders() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Get user's joined sessions for today and tomorrow
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: joinedSessions } = await supabase
    .from('session_participants')
    .select(`
      session_id,
      sessions:session_id (
        id,
        sport,
        date,
        start_time,
        location
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .gte('sessions.date', today.toISOString().split('T')[0])
    .lte('sessions.date', tomorrow.toISOString().split('T')[0]);

  if (!joinedSessions) return;

  // Schedule notifications for each session (1 hour before)
  joinedSessions.forEach(({ sessions: session }: any) => {
    if (!session) return;

    const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
    const reminderTime = new Date(sessionDateTime.getTime() - 60 * 60 * 1000); // 1 hour before
    const now = new Date();

    if (reminderTime > now) {
      const timeUntilReminder = reminderTime.getTime() - now.getTime();
      
      setTimeout(() => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Tribe Session Reminder', {
            body: `Your ${session.sport} session at ${session.location} starts in 1 hour!`,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
          });
        }
      }, timeUntilReminder);
    }
  });
}
