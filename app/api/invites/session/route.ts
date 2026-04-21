import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createNotification } from '@/lib/dal/notifications';
import { fetchSession } from '@/lib/dal/sessions';
import { checkRateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

const inviteSchema = z.object({
  session_id: z.string().uuid(),
  recipient_user_id: z.string().uuid(),
});

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

    // Rate limit: max 10 invites per minute per user.
    const { allowed } = await checkRateLimit(supabase, `invite-session:${user.id}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many invites. Please wait a moment.' }, { status: 429 });
    }

    const raw = await request.json();
    const parsed = inviteSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
    }

    const { session_id, recipient_user_id } = parsed.data;

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

    // Create notification using service role client to bypass RLS
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const notifResult = await createNotification(serviceSupabase, {
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
