import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Verify this is from Vercel Cron (optional but recommended)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    
    // Get current time and time 2 hours from now
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const twoHoursFifteenMinsFromNow = new Date(now.getTime() + 2.25 * 60 * 60 * 1000);
    
    // Find sessions starting in ~2 hours that haven't sent reminders
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*, creator:users!sessions_creator_id_fkey(id, name, email)')
      .eq('status', 'active')
      .eq('reminder_sent', false)
      .gte('date', now.toISOString().split('T')[0])
      .lte('date', twoHoursFifteenMinsFromNow.toISOString().split('T')[0]);

    if (error) throw error;

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ message: 'No sessions need reminders', count: 0 });
    }

    // Filter sessions by time (checking if session is in 2-hour window)
    const sessionsToRemind = sessions.filter(session => {
      const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
      return sessionDateTime >= twoHoursFromNow && sessionDateTime <= twoHoursFifteenMinsFromNow;
    });

    // Send reminders for each session
    for (const session of sessionsToRemind) {
      // Get all confirmed participants
      const { data: participants } = await supabase
        .from('session_participants')
        .select('user_id, users!session_participants_user_id_fkey(id, name, email)')
        .eq('session_id', session.id)
        .eq('status', 'confirmed');

      // Send notification to host
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

      // Send notifications to participants
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

      // Mark reminder as sent
      await supabase
        .from('sessions')
        .update({ reminder_sent: true })
        .eq('id', session.id);
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${sessionsToRemind.length} reminders`,
      count: sessionsToRemind.length
    });

  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
