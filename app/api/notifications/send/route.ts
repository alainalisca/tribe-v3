import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { log, logError } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { sendFcmNotification, sendWebPushNotification, isFcmTokenInvalid } from './notificationHelpers';
import { updateUser, updateUsersByIds, fetchUserProfileMaybe } from '@/lib/dal';

/**
 * @description Sends a push notification to a single user via FCM (for native apps) or Web Push (for browsers), with automatic fallback and stale token cleanup.
 * @method POST
 * @auth Required - validates the caller is authenticated via Supabase auth. Rate limited to 30 requests per minute.
 * @param {Object} request.body - JSON body with `userId` (string), `title` (string), `body` (string), optional `url` (string), and optional `data` (Record<string, string>).
 * @returns {{ success: boolean, method: 'fcm' | 'web-push', platform: string }} Delivery method used on success, or error details on failure.
 */
export async function POST(request: Request) {
  try {
    // AUTH: verify the caller is authenticated
    const supabaseAuth = await createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = rateLimit(ip, { maxRequests: 30, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { userId, title, body, url, data } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json({ error: 'Missing required fields: userId, title, body' }, { status: 400 });
    }

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
 * @auth Required - validates the caller is authenticated via Supabase auth. Rate limited to 10 requests per minute.
 * @param {Object} request.body - JSON body with `userIds` (string[]), `title` (string), `body` (string), optional `url` (string), and optional `data` (Record<string, string>).
 * @returns {{ success: boolean, results: { total: number, fcm: Object, webPush: Object, noSubscription: number } }} Breakdown of send results per notification channel.
 */
// Batch send notifications to multiple users
export async function PUT(request: Request) {
  try {
    // AUTH: verify the caller is authenticated
    const supabaseAuth = await createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = rateLimit(ip, { maxRequests: 10, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { userIds, title, body, url, data } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid userIds array' }, { status: 400 });
    }

    if (!title || !body) {
      return NextResponse.json({ error: 'Missing required fields: title, body' }, { status: 400 });
    }

    const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Get all users' notification credentials
    const userResults = await Promise.all(
      userIds.map((id: string) => fetchUserProfileMaybe(supabase, id, 'id, push_subscription, fcm_token, fcm_platform'))
    );
    const fetchError = userResults.find((r) => !r.success);
    if (fetchError) {
      logError(fetchError.error, { route: '/api/notifications/send', action: 'fetch_users_batch' });
      return NextResponse.json({ error: 'Error fetching user data' }, { status: 500 });
    }
    const users = userResults
      .filter((r) => r.data != null)
      .map(
        (r) =>
          r.data as { id: string; push_subscription: unknown; fcm_token: string | null; fcm_platform: string | null }
      );

    const notificationData: Record<string, string> = {
      url: url || '/',
      ...(data || {}),
    };

    const results = {
      total: userIds.length,
      fcm: { sent: 0, failed: 0 },
      webPush: { sent: 0, failed: 0 },
      noSubscription: 0,
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
