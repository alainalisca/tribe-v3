import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import {
  getRandomMessage,
  getMessageContent,
  replaceMessageVariables
} from '@/lib/motivational-messages';

// Colombia timezone offset (UTC-5)
const COLOMBIA_TZ_OFFSET = -5;

function getColombiaTime(): { hour: number; dayOfWeek: number } {
  const now = new Date();
  // Get Colombia time
  const colombiaTime = new Date(now.getTime() + (COLOMBIA_TZ_OFFSET * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
  return {
    hour: colombiaTime.getUTCHours(),
    dayOfWeek: colombiaTime.getUTCDay() // 0 = Sunday
  };
}

function isSundayEveningWindow(): boolean {
  const { hour, dayOfWeek } = getColombiaTime();
  // Sunday (0) at 6 PM (18:00) Colombia time
  return dayOfWeek === 0 && hour === 18;
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const now = new Date();
    const { hour, dayOfWeek } = getColombiaTime();

    let weeklyRecapsSent = 0;
    let reEngagementsSent = 0;

    // 1. WEEKLY RECAP (Sundays at 6 PM Colombia time)
    if (isSundayEveningWindow()) {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const today = now.toISOString().split('T')[0];

      // Get users with push subscriptions who haven't received weekly recap today
      const { data: users } = await supabase
        .from('users')
        .select('id, preferred_language, push_subscription, last_weekly_recap_sent')
        .not('push_subscription', 'is', null)
        .or(`last_weekly_recap_sent.is.null,last_weekly_recap_sent.lt.${today}`);

      if (users && users.length > 0) {
        for (const user of users) {
          // Get user's session participation for the past week
          const { data: participations } = await supabase
            .from('session_participants')
            .select('session_id, sessions!inner(date, sport, duration)')
            .eq('user_id', user.id)
            .eq('status', 'confirmed')
            .gte('sessions.date', oneWeekAgo.toISOString().split('T')[0])
            .lte('sessions.date', today);

          // Get sessions the user hosted
          const { data: hostedSessions } = await supabase
            .from('sessions')
            .select('id, date, sport, duration, current_participants')
            .eq('creator_id', user.id)
            .gte('date', oneWeekAgo.toISOString().split('T')[0])
            .lte('date', today);

          const sessionsJoined = participations?.length || 0;
          const sessionsHosted = hostedSessions?.length || 0;
          const totalSessions = sessionsJoined + sessionsHosted;

          // Calculate total training hours
          let totalMinutes = 0;
          participations?.forEach(p => {
            totalMinutes += (p.sessions as any)?.duration || 0;
          });
          hostedSessions?.forEach(s => {
            totalMinutes += s.duration || 0;
          });
          const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

          // Calculate how many people the user helped (attendees at their hosted sessions)
          let peopleHelped = 0;
          hostedSessions?.forEach(s => {
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
            new_connections: sessionsJoined
          });

          try {
            await fetch(`${SITE_URL}/api/notifications/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: user.id,
                title: content.title,
                body: content.body,
                url: '/my-sessions'
              })
            });

            await supabase
              .from('users')
              .update({ last_weekly_recap_sent: new Date().toISOString() })
              .eq('id', user.id);

            weeklyRecapsSent++;
          } catch (err) {
            console.error(`Failed to send weekly recap to user ${user.id}:`, err);
          }
        }
      }
    }

    // 2. RE-ENGAGEMENT (Users inactive for 3+ days)
    // Run this check every time the cron runs, but only send once per 3 days to inactive users
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get users who:
    // - Have push subscriptions
    // - Haven't been active in 3+ days
    // - Haven't received re-engagement notification in the past 3 days
    // - But were active within the last 60 days (not completely churned)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const { data: inactiveUsers } = await supabase
      .from('users')
      .select('id, preferred_language, push_subscription, updated_at, last_reengagement_sent')
      .not('push_subscription', 'is', null)
      .lte('updated_at', threeDaysAgo.toISOString())
      .gte('updated_at', sixtyDaysAgo.toISOString())
      .or(`last_reengagement_sent.is.null,last_reengagement_sent.lt.${threeDaysAgo.toISOString()}`);

    if (inactiveUsers && inactiveUsers.length > 0) {
      // Count available sessions in the system
      const { count: availableSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .gte('date', now.toISOString().split('T')[0]);

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
          count: availableSessions || 0
        });

        try {
          await fetch(`${SITE_URL}/api/notifications/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.id,
              title: content.title,
              body: content.body,
              url: '/'
            })
          });

          await supabase
            .from('users')
            .update({ last_reengagement_sent: new Date().toISOString() })
            .eq('id', user.id);

          reEngagementsSent++;
        } catch (err) {
          console.error(`Failed to send re-engagement to user ${user.id}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      colombiaTime: { hour, dayOfWeek },
      isSundayEvening: isSundayEveningWindow(),
      weeklyRecapsSent,
      reEngagementsSent
    });

  } catch (error: any) {
    console.error('Engagement cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
