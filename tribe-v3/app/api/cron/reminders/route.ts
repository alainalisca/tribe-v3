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
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    
    // 1. SEND SESSION REMINDERS (2 hours before)
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursFifteenMinsFromNow = new Date(now.getTime() + 2.25 * 60 * 60 * 1000);
    
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*, creator:users!sessions_creator_id_fkey(id, name, email, preferred_language)')
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
          .select('user_id, users!session_participants_user_id_fkey(id, name, email, preferred_language)')
          .eq('session_id', session.id)
          .eq('status', 'confirmed');

        // Get host language preference
        const hostLang = session.creator?.preferred_language || 'en';
        const hostTitle = hostLang === 'es' ? '¡No entrenes solo hoy!' : "Don't train alone today!";
        const hostBody = hostLang === 'es' 
          ? `Tu sesión de ${session.sport} comienza en 2 horas en ${session.location}`
          : `Your ${session.sport} session starts in 2 hours at ${session.location}`;

        // Send to host
        await fetch(`${SITE_URL}/api/notifications/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.creator.id,
            title: hostTitle,
            body: hostBody,
            url: `/session/${session.id}`
          })
        });

        // Send to participants
        for (const participant of (participants || [])) {
          const pLang = (participant as any).users?.preferred_language || 'en';
          const pTitle = pLang === 'es' ? '¡Tu sesión comienza pronto!' : 'Session starting soon!';
          const pBody = pLang === 'es'
            ? `${session.sport} comienza en 2 horas en ${session.location}. ¡No entrenes solo!`
            : `${session.sport} starts in 2 hours at ${session.location}. Never train alone!`;

          await fetch(`${SITE_URL}/api/notifications/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: participant.user_id,
              title: pTitle,
              body: pBody,
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
      .not('push_subscription', 'is', null)
      .or(`last_motivation_sent.is.null,last_motivation_sent.lt.${today}`);

    let motivationsSent = 0;

    if (users && users.length > 0) {
      for (const user of users) {
        const message = getRandomMessage();
        const lang = user.preferred_language || 'en';
        const content = lang === 'es' ? message.es : message.en;

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
