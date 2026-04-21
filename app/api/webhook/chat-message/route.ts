import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { log, logError } from '@/lib/logger';
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
 * Constant-time comparison of two strings (AUDIT-P0-3). A plain `===` compare
 * exits at the first differing byte, leaking timing info that lets a remote
 * attacker iteratively learn the secret. `timingSafeEqual` always compares
 * the full buffer. The length check is intentionally before the compare so
 * it's not a covert timing channel either — a mismatched length is
 * unambiguously a mismatched secret.
 */
function safeSecretEqual(a: string | null, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Run `fn` over `items` with at most `concurrency` in flight (AUDIT-P0-3).
 * Serial processing of a 50-person session chat held the serverless function
 * open long enough to trip Vercel's 10s (hobby) / 60s (pro) timeout.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * @description Webhook endpoint called by Supabase when a new chat message is inserted. Sends push notifications to all session participants except the sender.
 * @method POST
 * @auth Validated via WEBHOOK_SECRET header check (timing-safe compare). No user auth required.
 * @param {WebhookPayload} request.body - Supabase webhook payload containing the new chat_messages row.
 * @returns {{ success: boolean, notified: number }} Number of participants notified on success, or error on failure.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret (timing-safe compare — see safeSecretEqual).
    const incoming = request.headers.get('x-webhook-secret');
    const expected = process.env.WEBHOOK_SECRET;
    if (!expected || !safeSecretEqual(expected, incoming)) {
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

    // Fetch sender + session (including creator_id) + participants in parallel.
    // Previous implementation queried `sessions` twice — once for sport and
    // once for creator_id. Combined here (AUDIT P1-12).
    const [senderResult, sessionResult, participantsResult] = await Promise.all([
      supabase.from('users').select('name').eq('id', senderId).single(),
      supabase.from('sessions').select('sport, creator_id').eq('id', session_id).single(),
      supabase
        .from('session_participants')
        .select('user_id')
        .eq('session_id', session_id)
        .eq('status', 'confirmed')
        .neq('user_id', senderId),
    ]);

    const senderName = senderResult.data?.name || 'Someone';
    const sessionSport = sessionResult.data?.sport || 'Training';
    const creatorId = sessionResult.data?.creator_id;

    const participants = (participantsResult.data as ParticipantRow[] | null) ?? [];
    const userIds = participants.map((p) => p.user_id);

    // Include the session creator if they're not a participant and not the sender.
    if (creatorId && creatorId !== senderId && !userIds.includes(creatorId)) {
      userIds.push(creatorId);
    }

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, notified: 0 });
    }

    // Get notification credentials for all recipients (single IN query).
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

    // Fan out notification sends with a concurrency cap. 10 in flight
    // balances throughput against FCM/WebPush rate limits and serverless
    // connection pool pressure.
    const sendResults = await mapWithConcurrency(users as UserNotificationRow[], 10, async (user) => {
      if (!user.fcm_token && !user.push_subscription) {
        return { notified: false, invalidFcm: null, invalidWebPush: null };
      }

      let sent = false;
      let invalidFcm: string | null = null;
      let invalidWebPush: string | null = null;

      // Try FCM first.
      if (user.fcm_token) {
        const r = await sendFcmNotification(user.fcm_token, title, truncatedBody, notificationData);
        if (r.success) sent = true;
        else if (isFcmTokenInvalid(r.error)) invalidFcm = user.id;
      }

      // Fallback to web push.
      if (!sent && user.push_subscription) {
        const subscription =
          typeof user.push_subscription === 'string' ? JSON.parse(user.push_subscription) : user.push_subscription;
        const r = await sendWebPushNotification(subscription, title, truncatedBody, `/session/${session_id}/chat`);
        if (r.success) sent = true;
        else invalidWebPush = user.id;
      }

      return { notified: sent, invalidFcm, invalidWebPush };
    });

    const notified = sendResults.filter((r) => r.notified).length;
    const invalidFcmUserIds = sendResults.map((r) => r.invalidFcm).filter((x): x is string => x !== null);
    const invalidWebPushUserIds = sendResults.map((r) => r.invalidWebPush).filter((x): x is string => x !== null);

    // Clean up invalid tokens (in parallel). The PostgrestFilterBuilder is
    // thenable rather than a true Promise, so we wrap with `Promise.resolve`
    // to get a real Promise<unknown> that satisfies Promise.all's signature.
    const cleanups: Promise<unknown>[] = [];
    if (invalidFcmUserIds.length > 0) {
      cleanups.push(
        Promise.resolve(
          supabase
            .from('users')
            .update({ fcm_token: null, fcm_platform: null, fcm_updated_at: null })
            .in('id', invalidFcmUserIds)
        )
      );
    }
    if (invalidWebPushUserIds.length > 0) {
      cleanups.push(
        Promise.resolve(supabase.from('users').update({ push_subscription: null }).in('id', invalidWebPushUserIds))
      );
    }
    if (cleanups.length > 0) await Promise.all(cleanups);

    log('info', 'Chat webhook notification sent', { notified, total: userIds.length, session_id });

    return NextResponse.json({ success: true, notified });
  } catch (error: unknown) {
    logError(error, { route: '/api/webhook/chat-message', action: 'webhook_chat_notification' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
