import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createEvents, type EventAttributes } from 'ics';
import { log, logError } from '@/lib/logger';
import { fetchSessionFields } from '@/lib/dal';
import { rateLimit } from '@/lib/rate-limit';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';

/**
 * @description Generates a downloadable ICS calendar file for a given training session, including sport, location, time, and organizer details.
 * @method GET
 * @auth Optional - no authentication required; calendar links are publicly shareable.
 * @param {string} request.searchParams.sessionId - The UUID of the session to generate a calendar event for.
 * @returns {text/calendar} An ICS file attachment on success, or a JSON error if the session is not found.
 */
// PUBLIC: Calendar .ics files are shared via link — no auth required
export async function GET(request: Request) {
  try {
    // Rate limit to prevent abuse on this public endpoint
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = rateLimit(ip, { maxRequests: 30, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    const supabase = await createClient();

    const sessionResult = await fetchSessionFields(supabase, sessionId, '*, creator:users!creator_id(name)');
    const session = sessionResult.data as {
      id: string;
      sport: string;
      location: string;
      date: string;
      start_time: string;
      duration: number | null;
      description: string | null;
      creator: { name: string } | null;
    } | null;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Parse date and time - use T00:00:00 to avoid UTC interpretation of date-only strings
    const sessionDate = new Date(session.date + 'T00:00:00');
    const [hours, minutes] = session.start_time.split(':');

    const startDateTime = new Date(sessionDate);
    startDateTime.setHours(parseInt(hours), parseInt(minutes), 0);

    const endDateTime = new Date(startDateTime);
    endDateTime.setMinutes(endDateTime.getMinutes() + (session.duration || 60));

    // Create calendar event
    const event: EventAttributes = {
      start: [
        startDateTime.getFullYear(),
        startDateTime.getMonth() + 1,
        startDateTime.getDate(),
        startDateTime.getHours(),
        startDateTime.getMinutes(),
      ] as [number, number, number, number, number],
      end: [
        endDateTime.getFullYear(),
        endDateTime.getMonth() + 1,
        endDateTime.getDate(),
        endDateTime.getHours(),
        endDateTime.getMinutes(),
      ] as [number, number, number, number, number],
      title: `${session.sport} - Tribe`,
      description: `${session.description || ''}\n\nHosted by: ${session.creator?.name || 'Tribe Community'}\n\nNever Train Alone!\n\n${SITE_URL}/session/${sessionId}`,
      location: session.location,
      url: `${SITE_URL}/session/${sessionId}`,
      status: 'CONFIRMED' as const,
      busyStatus: 'BUSY' as const,
      organizer: { name: session.creator?.name || 'Tribe', email: 'tribe@aplusfitnessllc.com' },
    };

    const { error: icsError, value } = createEvents([event]);

    if (icsError) {
      log('error', 'ICS generation error', { route: '/api/generate-calendar', error: String(icsError), sessionId });
      return NextResponse.json({ error: 'Failed to generate calendar file' }, { status: 500 });
    }

    return new NextResponse(value, {
      headers: {
        'Content-Type': 'text/calendar',
        'Content-Disposition': `attachment; filename="tribe-${session.sport.toLowerCase()}-${session.date}.ics"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    logError(error, { route: '/api/generate-calendar', action: 'generate_calendar' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
