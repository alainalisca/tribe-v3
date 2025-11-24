import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getRandomMessage } from '@/lib/motivational-messages';

export async function GET(request: Request) {
  try {
    // Verify this is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    
    // 1. SEND SESSION REMINDERS (2 hours before)
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursFifteenMinsFromNow = new Date(now.getTime() + 2.25 * 60 * 60 * 1000);
    
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*, creator:users!sessions_creator_id_fkey(id, name, email)')
      .eq('status', 'active')
      .eq('reminder_sent', false)
      .gte('date', now.toISOString().split('T')[0])
      .lte('date', twoHoursFifteenMinsFromNow.toISOString().split('T')[0]);

    let remindersSent = 0;

    if (sessions && sessions.length > 0) {
      const sessionsToRemind = sessions.filter(session => {
        const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
        return sessionDateTime >= twoHoursFromNow && sessionDateTime <= twoHoursFifteenMinsFromNow;
      });

      for (const session of sessionsToRemind) {
        const { data: participants } = await supabase
          .from('session_participants')
          .select('user_id, users!session_participants_user_id_fkey(id, name, email)')
          .eq('session_id', session.id)
          .eq('status', 'confirmed');

        // Send to host
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/notifications/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.creator.id,
            title: `Session starting soon!`,
            body: `Your ${session.sport} session starts in 2 hours at ${session.location}`,
            url: `/session/${session.id}`
          })
        });

        // Send to participants
        for (const participant of (participants || [])) {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/notifications/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: participant.user_id,
              title: `Session starting soon!`,
              body: `${session.sport} session starts in 2 hours at ${session.location}`,
              url: `/session/${session.id}`
            })
          });
        }

        await supabase
          .from('sessions')
          .update({ reminder_sent: true })
          .eq('id', session.id);
        
        remindersSent++;
      }
    }

    // 2. SEND DAILY MOTIVATIONAL MESSAGES
    const today = new Date().toISOString().split('T')[0];
    
    const { data: users } = await supabase
      .from('users')
      .select('id, preferred_language, push_subscription')
      .neq('push_subscription', null)
      .or(`last_motivation_sent.is.null,last_motivation_sent.lt.${today}`);

    let motivationsSent = 0;

    if (users && users.length > 0) {
      for (const user of users) {
        const message = getRandomMessage();
        const language = user.preferred_language || 'en';
        const content = language === 'es' ? message.es : message.en;

        try {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/notifications/send`, {
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
            .update({ last_motivation_sent: new Date().toISOString() })
            .eq('id', user.id);

          motivationsSent++;
        } catch (err) {
          console.error(`Failed to send motivation to user ${user.id}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${remindersSent} session reminders and ${motivationsSent} motivational messages`,
      reminders: remindersSent,
      motivations: motivationsSent
    });

  } catch (error: any) {
    console.error('Morning cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
