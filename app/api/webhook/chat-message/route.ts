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
  console.log('[WEBHOOK] POST received');
  console.log('[WEBHOOK] Headers:', JSON.stringify(Object.fromEntries(request.headers.entries())));

  try {
    // Validate webhook secret
    const secret = request.headers.get('x-webhook-secret');
    const envSecret = process.env.WEBHOOK_SECRET;
    console.log(
      '[WEBHOOK] Secret check — header present:',
      !!secret,
      'env present:',
      !!envSecret,
      'match:',
      secret === envSecret
    );
    if (!envSecret || secret !== envSecret) {
      console.log('[WEBHOOK] REJECTED: secret mismatch');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json()) as WebhookPayload;
    console.log(
      '[WEBHOOK] Payload:',
      JSON.stringify({ type: payload.type, table: payload.table, record: payload.record })
    );

    // Only process INSERT events on chat_messages
    if (payload.type !== 'INSERT' || payload.table !== 'chat_messages') {
      console.log('[WEBHOOK] Skipped: not an INSERT on chat_messages');
      return NextResponse.json({ success: true, skipped: true });
    }

    const { session_id, user_id: senderId, message, deleted } = payload.record;
    console.log('[WEBHOOK] Message from:', senderId, 'in session:', session_id, 'deleted:', deleted);

    // Skip deleted messages
    if (deleted) {
      console.log('[WEBHOOK] Skipped: message is deleted');
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
    console.log('[WEBHOOK] Sender:', senderName, 'Sport:', sessionSport);

    // Get all confirmed participants except the sender
    const { data: participants, error: participantsError } = await supabase
      .from('session_participants')
      .select('user_id')
      .eq('session_id', session_id)
      .eq('status', 'confirmed')
      .neq('user_id', senderId);

    console.log(
      '[WEBHOOK] Participants query — error:',
      participantsError?.message || 'none',
      'count:',
      participants?.length || 0
    );

    if (participantsError || !participants || participants.length === 0) {
      console.log('[WEBHOOK] No participants found, checking creator...');
    }

    const userIds = participants ? (participants as ParticipantRow[]).map((p) => p.user_id) : [];

    // Also include the session creator if they're not a participant and not the sender
    const { data: sessionCreator } = await supabase.from('sessions').select('creator_id').eq('id', session_id).single();
    console.log('[WEBHOOK] Creator:', sessionCreator?.creator_id);

    if (
      sessionCreator?.creator_id &&
      sessionCreator.creator_id !== senderId &&
      !userIds.includes(sessionCreator.creator_id)
    ) {
      userIds.push(sessionCreator.creator_id);
      console.log('[WEBHOOK] Added creator to recipients');
    }

    if (userIds.length === 0) {
      console.log('[WEBHOOK] No recipients at all, returning');
      return NextResponse.json({ success: true, notified: 0 });
    }

    console.log('[WEBHOOK] Recipients:', userIds);

    // Get notification credentials for all recipients
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, push_subscription, fcm_token, fcm_platform')
      .in('id', userIds);

    console.log('[WEBHOOK] Users query — error:', usersError?.message || 'none', 'count:', users?.length || 0);
    if (users) {
      for (const u of users as UserNotificationRow[]) {
        console.log(
          '[WEBHOOK] User',
          u.id.substring(0, 8),
          '— fcm:',
          u.fcm_token?.substring(0, 20) || 'null',
          'web:',
          !!u.push_subscription,
          'platform:',
          u.fcm_platform
        );
      }
    }

    if (usersError || !users || users.length === 0) {
      console.log('[WEBHOOK] No users with credentials, returning');
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
      if (!user.fcm_token && !user.push_subscription) {
        console.log('[WEBHOOK] User', user.id.substring(0, 8), '— no credentials, skipping');
        continue;
      }

      let sent = false;

      // Try FCM first
      if (user.fcm_token) {
        console.log('[WEBHOOK] Sending FCM to', user.id.substring(0, 8));
        const result = await sendFcmNotification(user.fcm_token, title, truncatedBody, notificationData);
        console.log('[WEBHOOK] FCM result for', user.id.substring(0, 8), ':', result.success, result.error || '');
        if (result.success) {
          sent = true;
          notified++;
        } else if (isFcmTokenInvalid(result.error)) {
          invalidFcmUserIds.push(user.id);
        }
      }

      // Fallback to web push
      if (!sent && user.push_subscription) {
        console.log('[WEBHOOK] Sending WebPush to', user.id.substring(0, 8));
        const subscription =
          typeof user.push_subscription === 'string' ? JSON.parse(user.push_subscription) : user.push_subscription;
        const result = await sendWebPushNotification(subscription, title, truncatedBody, `/session/${session_id}/chat`);
        console.log('[WEBHOOK] WebPush result for', user.id.substring(0, 8), ':', result.success, result.error || '');
        if (result.success) {
          notified++;
        } else {
          invalidWebPushUserIds.push(user.id);
        }
      }
    }

    // Clean up invalid tokens
    if (invalidFcmUserIds.length > 0) {
      console.log('[WEBHOOK] Clearing invalid FCM tokens for:', invalidFcmUserIds);
      await supabase
        .from('users')
        .update({ fcm_token: null, fcm_platform: null, fcm_updated_at: null })
        .in('id', invalidFcmUserIds);
    }
    if (invalidWebPushUserIds.length > 0) {
      console.log('[WEBHOOK] Clearing invalid web push for:', invalidWebPushUserIds);
      await supabase.from('users').update({ push_subscription: null }).in('id', invalidWebPushUserIds);
    }

    console.log(`[WEBHOOK] DONE: ${senderName} → ${notified}/${userIds.length} recipients in session ${session_id}`);

    return NextResponse.json({ success: true, notified });
  } catch (error: unknown) {
    console.error('[WEBHOOK] FATAL:', error instanceof Error ? error.message : String(error));
    logError(error, { route: '/api/webhook/chat-message', action: 'webhook_chat_notification' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
