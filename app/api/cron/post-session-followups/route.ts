import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    // Verify this is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    
    // Get sessions that ended in the last 2 hours and haven't sent follow-ups
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, sport, location, date, start_time, duration')
      .eq('followup_sent', false)
      .lt('date', now.toISOString().split('T')[0]);

    if (error) throw error;

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ message: 'No sessions need follow-ups', count: 0 });
    }

    // Filter for sessions that actually ended
    const endedSessions = sessions.filter(session => {
      const sessionStart = new Date(`${session.date}T${session.start_time}`);
      const sessionEnd = new Date(sessionStart.getTime() + session.duration * 60 * 1000);
      return sessionEnd <= now && sessionEnd >= twoHoursAgo;
    });

    let sentCount = 0;

    // Send follow-up emails to participants who attended
    for (const session of endedSessions) {
      const { data: attendees } = await supabase
        .from('session_attendance')
        .select('user_id')
        .eq('session_id', session.id)
        .eq('attended', true);

      if (!attendees || attendees.length === 0) continue;

      // Send email to each attendee
      for (const attendee of attendees) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/send-attendance-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: session.id,
              userId: attendee.user_id
            })
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to send email for session ${session.id}, user ${attendee.user_id}:`, err);
        }
      }

      // Mark follow-up as sent
      await supabase
        .from('sessions')
        .update({ followup_sent: true })
        .eq('id', session.id);
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${sentCount} follow-up emails for ${endedSessions.length} sessions`,
      count: sentCount
    });

  } catch (error: any) {
    console.error('Post-session follow-up cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
