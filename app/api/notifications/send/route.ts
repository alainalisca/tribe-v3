import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { log, logError } from '@/lib/logger';
import { isValidCronAuth } from '@/lib/auth/cron';
import { sendFcmNotification, sendWebPushNotification, isFcmTokenInvalid } from './notificationHelpers';
import { updateUser, updateUsersByIds, fetchUserProfileMaybe } from '@/lib/dal';

// `url` is a client-side deep-link path (e.g. "/session/abc"), never
// fetched server-side, so it is a bounded string — NOT z.string().url(),
// which rejects app-relative paths and silently 400'd every real caller.
const sendNotificationSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  url: z.string().max(2048).optional(),
  data: z.record(z.string(), z.string()).optional(),
});

const batchNotificationSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  url: z.string().max(2048).optional(),
  data: z.record(z.string(), z.string()).optional(),
});

/**
 * @description Sends a push notification to a single user via FCM (for native apps) or Web Push (for browsers), with automatic fallback and stale token cleanup.
 * @method POST
 * @auth Internal only — requires a valid CRON_SECRET bearer. Not reachable with a user session.
 * @param {Object} request.body - JSON body with `userId` (string), `title` (string), `body` (string), optional `url` (string), and optional `data` (Record<string, string>).
 * @returns {{ success: boolean, method: 'fcm' | 'web-push', platform: string }} Delivery method used on success, or error details on failure.
 */
export async function POST(request: Request) {
  try {
    // AUTH: internal callers only. This endpoint can push arbitrary
    // title/body to ANY user, so it must never be reachable with just a
    // logged-in user session (that was a phishing/spoofing vector — any
    // signed-up user could push Tribe-branded notifications to anyone).
    // All legitimate callers are server-to-server (cron jobs,
    // payment/booking webhooks, nearby alerts, the join-notify route) and
    // present a valid internal CRON_SECRET bearer.
    if (!isValidCronAuth(request.headers.get('authorization'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = sendNotificationSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
    }

    const { userId, title, body, url, data } = parsed.data;

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get user's notification credentials
    const userResult = await fetchUserProfileMaybe(supabase, userId, 'push_subscription, fcm_token, fcm_platform');

    if (!userResult.success || !userResult.data) {
      logError(userResult.error, { route: '/api/notifications/send', action: 'fetch_user', userId });
      return NextResponse.json({ error: 'Error fetching user data' }, { status: 500 });
    }

    const user = userResult.data as {
      push_subscription: unknown;
      fcm_token: string | null;
      fcm_platform: string | null;
    };

    if (!user?.push_subscription && !user?.fcm_token) {
      return NextResponse.json({ error: 'No push subscription or FCM token found for user' }, { status: 404 });
    }

    // Prepare notification data payload
    const notificationData: Record<string, string> = {
      url: url || '/',
      ...(data || {}),
    };

    const errors: string[] = [];
    let fcmResult: { success: boolean; error?: string } = { success: false, error: 'not attempted' };
    let webPushResult: { success: boolean; error?: string } = { success: false, error: 'not attempted' };

    // Log what credentials the user has
    log('debug', 'User notification credentials', {
      route: '/api/notifications/send',
      userId,
      hasFcmToken: !!user.fcm_token,
      hasPushSubscription: !!user.push_subscription,
      platform: user.fcm_platform || 'none',
    });

    // Try FCM first (for native apps)
    if (user.fcm_token) {
      fcmResult = await sendFcmNotification(user.fcm_token, title, body, notificationData);

      if (!fcmResult.success) {
        errors.push(`FCM: ${fcmResult.error}`);
        // Only clear token if it's actually invalid, not for server-side init errors
        if (isFcmTokenInvalid(fcmResult.error)) {
          await updateUser(supabase, userId, { fcm_token: null, fcm_platform: null, fcm_updated_at: null });
        }
      }
    }

    // Try Web Push (for browser users)
    if (user.push_subscription && !fcmResult.success) {
      const subscription =
        typeof user.push_subscription === 'string' ? JSON.parse(user.push_subscription) : user.push_subscription;

      webPushResult = await sendWebPushNotification(subscription, title, body, url);

      // If web push failed due to expired subscription, clear it
      if (!webPushResult.success) {
        errors.push(`WebPush: ${webPushResult.error}`);
        await updateUser(supabase, userId, { push_subscription: null });
      }
    }

    if (fcmResult.success || webPushResult.success) {
      return NextResponse.json({
        success: true,
        method: fcmResult.success ? 'fcm' : 'web-push',
        platform: user.fcm_platform || 'web',
      });
    }

    return NextResponse.json(
      {
        error: 'Failed to send notification via any method',
        details: errors,
        userHasFcmToken: !!user.fcm_token,
        userHasPushSubscription: !!user.push_subscription,
        fcmPlatform: user.fcm_platform || null,
      },
      { status: 500 }
    );
  } catch (error: unknown) {
    logError(error, { route: '/api/notifications/send', action: 'send_notification' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * @description Batch sends push notifications to multiple users via FCM or Web Push, with automatic fallback and stale token/subscription cleanup.
 * @method PUT
 * @auth Internal only — requires a valid CRON_SECRET bearer. Not reachable with a user session.
 * @param {Object} request.body - JSON body with `userIds` (string[]), `title` (string), `body` (string), optional `url` (string), and optional `data` (Record<string, string>).
 * @returns {{ success: boolean, results: { total: number, fcm: Object, webPush: Object, noSubscription: number } }} Breakdown of send results per notification channel.
 */
// Batch send notifications to multiple users
export async function PUT(request: Request) {
  try {
    // AUTH: internal callers only (same rationale as POST). Batch send is
    // used server-to-server by notify-nearby with the internal secret.
    if (!isValidCronAuth(request.headers.get('authorization'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await request.json();
    const parsed = batchNotificationSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(', ') }, { status: 400 });
    }

    const { userIds, title, body, url, data } = parsed.data;

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // AUDIT-P0-4: batch-fetch in a single IN query instead of N round trips.
    // Previous implementation did `Promise.all(ids.map(id => fetchUserProfileMaybe(...)))`
    // which issued one SELECT per user — a 100-user batch meant 100 RTs.
    const { data: usersRaw, error: usersError } = await supabase
      .from('users')
      .select('id, push_subscription, fcm_token, fcm_platform')
      .in('id', userIds);

    if (usersError) {
      logError(usersError, { route: '/api/notifications/send', action: 'fetch_users_batch' });
      return NextResponse.json({ error: 'Error fetching user data' }, { status: 500 });
    }
    const users = (usersRaw ?? []) as Array<{
      id: string;
      push_subscription: unknown;
      fcm_token: string | null;
      fcm_platform: string | null;
    }>;

    const notificationData: Record<string, string> = {
      url: url || '/',
      ...(data || {}),
    };

    // `notFound` counts requested ids that didn't resolve to a user row
    // (soft-deleted, wrong id, etc.). Previously these were silently folded
    // into total, making results.total > (sent + failed + noSubscription)
    // whenever any id was stale. Breaking it out lets callers distinguish
    // "no push credentials" from "user doesn't exist".
    const notFound = userIds.length - users.length;
    const results = {
      total: userIds.length,
      fcm: { sent: 0, failed: 0 },
      webPush: { sent: 0, failed: 0 },
      noSubscription: 0,
      notFound,
    };

    const invalidFcmTokenUserIds: string[] = [];
    const invalidWebPushUserIds: string[] = [];

    // Process each user
    for (const user of users) {
      if (!user.push_subscription && !user.fcm_token) {
        results.noSubscription++;
        continue;
      }

      let sent = false;

      // Try FCM first
      if (user.fcm_token) {
        const fcmResult = await sendFcmNotification(user.fcm_token, title, body, notificationData);

        if (fcmResult.success) {
          results.fcm.sent++;
          sent = true;
        } else {
          results.fcm.failed++;
          // Only mark token as invalid for token-specific errors
          if (isFcmTokenInvalid(fcmResult.error)) {
            invalidFcmTokenUserIds.push(user.id);
          }
        }
      }

      // Try Web Push if FCM didn't work
      if (!sent && user.push_subscription) {
        const subscription =
          typeof user.push_subscription === 'string' ? JSON.parse(user.push_subscription) : user.push_subscription;

        const wpResult = await sendWebPushNotification(subscription, title, body, url);

        if (wpResult.success) {
          results.webPush.sent++;
        } else {
          results.webPush.failed++;
          invalidWebPushUserIds.push(user.id);
        }
      }
    }

    // Clean up invalid tokens/subscriptions
    if (invalidFcmTokenUserIds.length > 0) {
      await updateUsersByIds(supabase, invalidFcmTokenUserIds, {
        fcm_token: null,
        fcm_platform: null,
        fcm_updated_at: null,
      });
    }

    if (invalidWebPushUserIds.length > 0) {
      await updateUsersByIds(supabase, invalidWebPushUserIds, { push_subscription: null });
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: unknown) {
    logError(error, { route: '/api/notifications/send', action: 'batch_send_notification' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
