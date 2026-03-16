import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import {
  sendFcmNotification,
  sendWebPushNotification,
  isFcmTokenInvalid,
} from '../../notifications/send/notificationHelpers';

interface WebhookPayload {
  type: 'INSERT';
  table: 'chat_messages';
  record: {
    id: string;
    session_id: string;
    user_id: string;
    message: string;
    created_at: string;
    deleted: boolean;
  };
  schema: string;
  old_record: null;
}

interface ParticipantRow {
  user_id: string;
}

interface UserNotificationRow {
  id: string;
  push_subscription: string | null;
  fcm_token: string | null;
  fcm_platform: string | null;
}

/**
 * @description Webhook endpoint called by Supabase when a new chat message is inserted. Sends push notifications to all session participants except the sender.
 * @method POST
 * @auth Validated via WEBHOOK_SECRET header check. No user auth required.
 * @param {WebhookPayload} request.body - Supabase webhook payload containing the new chat_messages row.
 * @returns {{ success: boolean, notified: number }} Number of participants notified on success, or error on failure.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    const secret = request.headers.get('x-webhook-secret');
    if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json()) as WebhookPayload;

    // Only process INSERT events on chat_messages
    if (payload.type !== 'INSERT' || payload.table !== 'chat_messages') {
      return NextResponse.json({ success: true, skipped: true });
    }

    const { session_id, user_id: senderId, message, deleted } = payload.record;

    // Skip deleted messages
    if (deleted) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get sender name and session sport in parallel
    const [senderResult, sessionResult] = await Promise.all([
      supabase.from('users').select('name').eq('id', senderId).single(),
      supabase.from('sessions').select('sport').eq('id', session_id).single(),
    ]);

    const senderName = senderResult.data?.name || 'Someone';
    const sessionSport = sessionResult.data?.sport || 'Training';

    // Get all confirmed participants except the sender
    const { data: participants, error: participantsError } = await supabase
      .from('session_participants')
      .select('user_id')
      .eq('session_id', session_id)
      .eq('status', 'confirmed')
      .neq('user_id', senderId);

    const userIds = participants && !participantsError ? (participants as ParticipantRow[]).map((p) => p.user_id) : [];

    // Also include the session creator if they're not a participant and not the sender
    const { data: sessionCreator } = await supabase.from('sessions').select('creator_id').eq('id', session_id).single();

    if (
      sessionCreator?.creator_id &&
      sessionCreator.creator_id !== senderId &&
      !userIds.includes(sessionCreator.creator_id)
    ) {
      userIds.push(sessionCreator.creator_id);
    }

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    // Get notification credentials for all recipients
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, push_subscription, fcm_token, fcm_platform')
      .in('id', userIds);

    if (usersError || !users || users.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    const title = `${senderName} in ${sessionSport}`;
    const truncatedBody = message.length > 100 ? message.slice(0, 100) + '...' : message;
    const notificationData: Record<string, string> = {
      type: 'chat_message',
      sessionId: session_id,
      url: `/session/${session_id}/chat`,
    };

    let notified = 0;
    const invalidFcmUserIds: string[] = [];
    const invalidWebPushUserIds: string[] = [];

    for (const user of users as UserNotificationRow[]) {
      if (!user.fcm_token && !user.push_subscription) continue;

      let sent = false;

      // Try FCM first
      if (user.fcm_token) {
        const result = await sendFcmNotification(user.fcm_token, title, truncatedBody, notificationData);
        if (result.success) {
          sent = true;
          notified++;
        } else if (isFcmTokenInvalid(result.error)) {
          invalidFcmUserIds.push(user.id);
        }
      }

      // Fallback to web push
      if (!sent && user.push_subscription) {
        const subscription =
          typeof user.push_subscription === 'string' ? JSON.parse(user.push_subscription) : user.push_subscription;
        const result = await sendWebPushNotification(subscription, title, truncatedBody, `/session/${session_id}/chat`);
        if (result.success) {
          notified++;
        } else {
          invalidWebPushUserIds.push(user.id);
        }
      }
    }

    // Clean up invalid tokens
    if (invalidFcmUserIds.length > 0) {
      await supabase
        .from('users')
        .update({ fcm_token: null, fcm_platform: null, fcm_updated_at: null })
        .in('id', invalidFcmUserIds);
    }
    if (invalidWebPushUserIds.length > 0) {
      await supabase.from('users').update({ push_subscription: null }).in('id', invalidWebPushUserIds);
    }

    // eslint-disable-next-line no-console
    console.log(`[WEBHOOK] Chat: ${senderName} → ${notified}/${userIds.length} in session ${session_id}`);

    return NextResponse.json({ success: true, notified });
  } catch (error: unknown) {
    logError(error, { route: '/api/webhook/chat-message', action: 'webhook_chat_notification' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
