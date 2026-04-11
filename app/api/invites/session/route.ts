import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/dal/notifications';
import { fetchSession } from '@/lib/dal/sessions';
import { logError } from '@/lib/logger';

// Simple in-memory rate limiter: userId -> timestamps[]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  rateLimitMap.set(userId, recent);
  if (recent.length >= RATE_LIMIT) return true;
  recent.push(now);
  rateLimitMap.set(userId, recent);
  return false;
}

/**
 * @description Sends a session invite notification to another athlete.
 * @method POST
 * @auth Required
 * @param {Object} request.body - { session_id: string, recipient_user_id: string }
 * @returns {{ success: boolean }}
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit
    if (isRateLimited(user.id)) {
      return NextResponse.json({ error: 'Too many invites. Please wait a moment.' }, { status: 429 });
    }

    const body = await request.json();
    const { session_id, recipient_user_id } = body as {
      session_id?: string;
      recipient_user_id?: string;
    };

    if (!session_id || !recipient_user_id) {
      return NextResponse.json({ error: 'session_id and recipient_user_id are required' }, { status: 400 });
    }

    if (recipient_user_id === user.id) {
      return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 });
    }

    // Validate session exists
    const sessionResult = await fetchSession(supabase, session_id);
    if (!sessionResult.success || !sessionResult.data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    const session = sessionResult.data;

    // Validate: sender is creator or confirmed participant
    const isCreator = session.creator_id === user.id;
    if (!isCreator) {
      const { data: participation } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', session_id)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (!participation) {
        return NextResponse.json({ error: 'You must be the creator or a participant to invite' }, { status: 403 });
      }
    }

    // Check recipient is not already in session
    const { data: existingParticipant } = await supabase
      .from('session_participants')
      .select('id')
      .eq('session_id', session_id)
      .eq('user_id', recipient_user_id)
      .maybeSingle();

    if (existingParticipant) {
      return NextResponse.json({ error: 'This athlete is already in the session' }, { status: 409 });
    }

    // Get sender name for notification message
    const { data: senderProfile } = await supabase.from('users').select('name').eq('id', user.id).single();

    const senderName = senderProfile?.name || 'Someone';
    const message = `${senderName} invited you to ${session.sport} on ${session.date}`;

    // Create notification
    const notifResult = await createNotification(supabase, {
      recipient_id: recipient_user_id,
      actor_id: user.id,
      type: 'session_invite',
      entity_type: 'session',
      entity_id: session_id,
      message,
    });

    if (!notifResult.success) {
      return NextResponse.json({ error: notifResult.error || 'Failed to send invite' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: '/api/invites/session', action: 'send_session_invite' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
