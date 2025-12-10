import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const timeBasedMessages = {
  morning: {
    en: [
      { title: "Start your day strong 💪", body: "Find a training partner for today's workout" },
      { title: "Good morning, athlete!", body: "Who's training with you today? Check Tribe." },
      { title: "Rise and grind ☀️", body: "Never train alone. Find partners nearby." },
    ],
    es: [
      { title: "Empieza el día fuerte 💪", body: "Encuentra un compañero para entrenar hoy" },
      { title: "¡Buenos días, atleta!", body: "¿Quién entrena contigo hoy? Revisa Tribe." },
      { title: "Arriba y a entrenar ☀️", body: "Nunca entrenes solo. Encuentra compañeros cerca." },
    ]
  },
  midday: {
    en: [
      { title: "Lunch break workout? 🏋️", body: "Quick session anyone? Post on Tribe." },
      { title: "Midday energy boost", body: "Find someone to train with this afternoon" },
      { title: "Don't skip today!", body: "Your training partners are waiting on Tribe" },
    ],
    es: [
      { title: "¿Entrenas en el almuerzo? 🏋️", body: "¿Sesión rápida? Publica en Tribe." },
      { title: "Energía de mediodía", body: "Encuentra alguien para entrenar esta tarde" },
      { title: "¡No te saltes el día!", body: "Tus compañeros te esperan en Tribe" },
    ]
  },
  afternoon: {
    en: [
      { title: "After-work sweat session? 🔥", body: "Find training partners heading to the gym" },
      { title: "Evening workout crew", body: "Who's training tonight? Check Tribe." },
      { title: "End the day strong", body: "Never train alone. Find your tribe." },
    ],
    es: [
      { title: "¿Sesión después del trabajo? 🔥", body: "Encuentra compañeros yendo al gym" },
      { title: "Equipo de entrenamiento nocturno", body: "¿Quién entrena esta noche? Revisa Tribe." },
      { title: "Termina el día fuerte", body: "Nunca entrenes solo. Encuentra tu tribu." },
    ]
  },
  evening: {
    en: [
      { title: "Last call for training! 🌙", body: "Anyone up for a late session?" },
      { title: "Night owl workout", body: "Find partners for tonight on Tribe" },
      { title: "Tomorrow's sessions are live", body: "Plan your training - find partners now" },
    ],
    es: [
      { title: "¡Última llamada para entrenar! 🌙", body: "¿Alguien para una sesión tardía?" },
      { title: "Entrenamiento nocturno", body: "Encuentra compañeros en Tribe" },
      { title: "Las sesiones de mañana están activas", body: "Planifica tu entrenamiento - encuentra compañeros" },
    ]
  }
};

function getTimeOfDay(): 'morning' | 'midday' | 'afternoon' | 'evening' {
  const hour = new Date().getUTCHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'midday';
  if (hour >= 17 && hour < 20) return 'afternoon';
  return 'evening';
}

function getRandomMessage(timeOfDay: string, lang: string) {
  const messages = timeBasedMessages[timeOfDay as keyof typeof timeBasedMessages][lang as 'en' | 'es'];
  return messages[Math.floor(Math.random() * messages.length)];
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const timeOfDay = getTimeOfDay();
    
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

        const hostLang = session.creator?.preferred_language || 'en';
        const hostTitle = hostLang === 'es' ? '¡Tu sesión comienza pronto!' : 'Your session starts soon!';
        const hostBody = hostLang === 'es' 
          ? `${session.sport} comienza en 2 horas en ${session.location}`
          : `${session.sport} starts in 2 hours at ${session.location}`;

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

        for (const participant of (participants || [])) {
          const pLang = (participant as any).users?.preferred_language || 'en';
          const pTitle = pLang === 'es' ? '¡Tu sesión comienza pronto!' : 'Session starting soon!';
          const pBody = pLang === 'es'
            ? `${session.sport} comienza en 2 horas. ¡Nunca entrenes solo!`
            : `${session.sport} starts in 2 hours. Never train alone!`;

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

    // 2. SEND TIME-BASED ENGAGEMENT NOTIFICATIONS
    const { data: users } = await supabase
      .from('users')
      .select('id, preferred_language, push_token')
      .not('push_token', 'is', null);

    let engagementsSent = 0;

    if (users && users.length > 0) {
      for (const user of users) {
        const lang = user.preferred_language || 'en';
        const message = getRandomMessage(timeOfDay, lang);

        try {
          await fetch(`${SITE_URL}/api/notifications/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.id,
              title: message.title,
              body: message.body,
              url: '/'
            })
          });
          engagementsSent++;
        } catch (err) {
          console.error(`Failed to send to user ${user.id}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      timeOfDay,
      sessionReminders: remindersSent,
      engagementNotifications: engagementsSent
    });

  } catch (error: any) {
    console.error('Reminders cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
