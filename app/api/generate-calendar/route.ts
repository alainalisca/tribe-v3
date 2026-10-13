import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createEvents, type EventAttributes } from 'ics';
import { log, logError } from '@/lib/logger';
import { fetchSessionFields } from '@/lib/dal';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/http/siteUrl';
import { TRIBE_SENDER_ADDRESS } from '@/lib/email/sender';
import { sessionStartUtc } from '@/lib/time/bogotaDate';

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
    const supabase = await createClient();
    const { allowed } = await checkRateLimit(getServiceRoleClient(), `calendar:${ip}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    // Explicit columns, not '*'. Two reasons: (1) this route is unauthenticated
    // (middleware public path), so '*' pulled all 50 columns — including
    // payment_instructions — to build a calendar file that needs eight of them;
    // (2) once anon loses SELECT on payment_instructions, '*' expands to a
    // column anon cannot read and the whole request 401s. Verified against
    // public.users, which already has that column-level treatment: anon
    // select=id returns 200 while select=* returns 42501.
    // RLS-H4: read the anon view (creator flattened; no FK embed against a view).
    const sessionResult = await fetchSessionFields(
      supabase,
      sessionId,
      'id, sport, location, date, start_time, duration, description, creator_name',
      'sessions_public'
    );
    const session = sessionResult.data as {
      id: string;
      sport: string;
      location: string;
      date: string;
      start_time: string;
      duration: number | null;
      description: string | null;
      creator_name: string | null;
    } | null;

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const startDateTime = sessionStartUtc(session.date, session.start_time);
    if (!startDateTime) {
      return NextResponse.json({ error: 'Invalid session date/time' }, { status: 400 });
    }

    const endDateTime = new Date(startDateTime.getTime() + (session.duration || 60) * 60 * 1000);

    const event: EventAttributes = {
      start: [
        startDateTime.getUTCFullYear(),
        startDateTime.getUTCMonth() + 1,
        startDateTime.getUTCDate(),
        startDateTime.getUTCHours(),
        startDateTime.getUTCMinutes(),
      ] as [number, number, number, number, number],
      startInputType: 'utc',
      end: [
        endDateTime.getUTCFullYear(),
        endDateTime.getUTCMonth() + 1,
        endDateTime.getUTCDate(),
        endDateTime.getUTCHours(),
        endDateTime.getUTCMinutes(),
      ] as [number, number, number, number, number],
      endInputType: 'utc',
      title: `${session.sport} - Tribe`,
      description: `${session.description || ''}\n\nHosted by: ${session.creator_name || 'Tribe Community'}\n\nNever Train Alone!\n\n${SITE_URL}/session/${sessionId}`,
      location: session.location,
      url: `${SITE_URL}/session/${sessionId}`,
      status: 'CONFIRMED' as const,
      busyStatus: 'BUSY' as const,
      organizer: { name: session.creator_name || 'Tribe', email: TRIBE_SENDER_ADDRESS },
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
