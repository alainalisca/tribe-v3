import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createEvents } from 'ics';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const supabase = await createClient();
    
    const { data: session } = await supabase
      .from('sessions')
      .select('*, creator:users!creator_id(name)')
      .eq('id', sessionId)
      .single();
    
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse date and time
    const sessionDate = new Date(session.date);
    const [hours, minutes] = session.start_time.split(':');
    
    const startDateTime = new Date(sessionDate);
    startDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
    
    const endDateTime = new Date(startDateTime);
    endDateTime.setMinutes(endDateTime.getMinutes() + (session.duration || 60));

    // Create calendar event
    const event = {
      start: [
        startDateTime.getFullYear(),
        startDateTime.getMonth() + 1,
        startDateTime.getDate(),
        startDateTime.getHours(),
        startDateTime.getMinutes()
      ] as [number, number, number, number, number],
      end: [
        endDateTime.getFullYear(),
        endDateTime.getMonth() + 1,
        endDateTime.getDate(),
        endDateTime.getHours(),
        endDateTime.getMinutes()
      ] as [number, number, number, number, number],
      title: `${session.sport} - Tribe`,
      description: `${session.description || ''}\n\nHosted by: ${session.creator?.name || 'Tribe Community'}\n\nNever Train Alone!\n\nhttps://tribe-v3.vercel.app/session/${sessionId}`,
      location: session.location,
      url: `https://tribe-v3.vercel.app/session/${sessionId}`,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      organizer: { name: session.creator?.name || 'Tribe', email: 'notifications@resend.dev' },
    };

    const { error: icsError, value } = createEvents([event as any]);
    
    if (icsError) {
      console.error('ICS generation error:', icsError);
      return NextResponse.json({ error: 'Failed to generate calendar file' }, { status: 500 });
    }

    return new NextResponse(value, {
      headers: {
        'Content-Type': 'text/calendar',
        'Content-Disposition': `attachment; filename="tribe-${session.sport.toLowerCase()}-${session.date}.ics"`,
      },
    });
  } catch (error: any) {
    console.error('Calendar generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
