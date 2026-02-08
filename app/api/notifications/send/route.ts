import { NextResponse } from 'next/server';
import webpush from 'web-push';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

// Initialize web-push with VAPID details
webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// Initialize Firebase Admin SDK (singleton)
let firebaseInitError: string | null = null;

function getFirebaseAdmin() {
  if (admin.apps.length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccount) {
      firebaseInitError = 'FIREBASE_SERVICE_ACCOUNT_KEY not set';
      console.warn(firebaseInitError);
      return null;
    }

    // Log the first 20 chars to help debug truncated env vars
    console.log(`FIREBASE_SERVICE_ACCOUNT_KEY starts with: "${serviceAccount.substring(0, 20)}..." (length: ${serviceAccount.length})`);

    try {
      const parsedServiceAccount = JSON.parse(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(parsedServiceAccount)
      });
      firebaseInitError = null;
    } catch (error: any) {
      firebaseInitError = `Firebase init failed: ${error.message}`;
      console.error(firebaseInitError);
      return null;
    }
  }

  return admin;
}

// Send notification via FCM
async function sendFcmNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const firebaseAdmin = getFirebaseAdmin();

  if (!firebaseAdmin) {
    return { success: false, error: firebaseInitError || 'Firebase Admin not initialized' };
  }

  try {
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title,
        body
      },
      data: data || {},
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'tribe_notifications'
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    const response = await firebaseAdmin.messaging().send(message);
    console.log('FCM notification sent successfully:', response);
    return { success: true };
  } catch (error: any) {
    const errorDetail = `FCM send error: ${error.code || 'unknown'} - ${error.message}`;
    console.error(errorDetail, error);

    // Handle invalid token error - should remove from database
    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      console.log('Invalid FCM token, should be removed from database');
    }

    return { success: false, error: errorDetail };
  }
}

// Send notification via Web Push
async function sendWebPushNotification(
  subscription: webpush.PushSubscription,
  title: string,
  body: string,
  url?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/'
    });

    await webpush.sendNotification(subscription, payload);
    console.log('Web push notification sent successfully');
    return { success: true };
  } catch (error: any) {
    const errorDetail = `Web push error: ${error.statusCode || 'unknown'} - ${error.message}`;
    console.error(errorDetail, error);

    // Handle expired subscription
    if (error.statusCode === 410) {
      console.log('Web push subscription expired, should be removed from database');
    }

    return { success: false, error: errorDetail };
  }
}

export async function POST(request: Request) {
  try {
    const { userId, title, body, url, data } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, title, body' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user's notification credentials
    const { data: user, error } = await supabase
      .from('users')
      .select('push_subscription, fcm_token, fcm_platform')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user:', error);
      return NextResponse.json(
        { error: 'Error fetching user data' },
        { status: 500 }
      );
    }

    if (!user?.push_subscription && !user?.fcm_token) {
      return NextResponse.json(
        { error: 'No push subscription or FCM token found for user' },
        { status: 404 }
      );
    }

    // Prepare notification data payload
    const notificationData: Record<string, string> = {
      url: url || '/',
      ...(data || {})
    };

    const errors: string[] = [];
    let fcmResult: { success: boolean; error?: string } = { success: false, error: 'not attempted' };
    let webPushResult: { success: boolean; error?: string } = { success: false, error: 'not attempted' };

    // Log what credentials the user has
    console.log(`User ${userId}: fcm_token=${user.fcm_token ? 'yes' : 'no'}, push_subscription=${user.push_subscription ? 'yes' : 'no'}, platform=${user.fcm_platform || 'none'}`);

    // Try FCM first (for native apps)
    if (user.fcm_token) {
      fcmResult = await sendFcmNotification(
        user.fcm_token,
        title,
        body,
        notificationData
      );

      // If FCM failed due to invalid token, clear it
      if (!fcmResult.success) {
        errors.push(`FCM: ${fcmResult.error}`);
        await supabase
          .from('users')
          .update({ fcm_token: null, fcm_platform: null, fcm_updated_at: null })
          .eq('id', userId);
      }
    }

    // Try Web Push (for browser users)
    if (user.push_subscription && !fcmResult.success) {
      const subscription =
        typeof user.push_subscription === 'string'
          ? JSON.parse(user.push_subscription)
          : user.push_subscription;

      webPushResult = await sendWebPushNotification(
        subscription,
        title,
        body,
        url
      );

      // If web push failed due to expired subscription, clear it
      if (!webPushResult.success) {
        errors.push(`WebPush: ${webPushResult.error}`);
        await supabase
          .from('users')
          .update({ push_subscription: null })
          .eq('id', userId);
      }
    }

    if (fcmResult.success || webPushResult.success) {
      return NextResponse.json({
        success: true,
        method: fcmResult.success ? 'fcm' : 'web-push',
        platform: user.fcm_platform || 'web'
      });
    }

    return NextResponse.json(
      {
        error: 'Failed to send notification via any method',
        details: errors,
        userHasFcmToken: !!user.fcm_token,
        userHasPushSubscription: !!user.push_subscription,
        fcmPlatform: user.fcm_platform || null
      },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('Error in notification send API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Batch send notifications to multiple users
export async function PUT(request: Request) {
  try {
    const { userIds, title, body, url, data } = await request.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid userIds array' },
        { status: 400 }
      );
    }

    if (!title || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: title, body' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all users' notification credentials
    const { data: users, error } = await supabase
      .from('users')
      .select('id, push_subscription, fcm_token, fcm_platform')
      .in('id', userIds);

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json(
        { error: 'Error fetching user data' },
        { status: 500 }
      );
    }

    const notificationData: Record<string, string> = {
      url: url || '/',
      ...(data || {})
    };

    const results = {
      total: userIds.length,
      fcm: { sent: 0, failed: 0 },
      webPush: { sent: 0, failed: 0 },
      noSubscription: 0
    };

    const invalidFcmTokenUserIds: string[] = [];
    const invalidWebPushUserIds: string[] = [];

    // Process each user
    for (const user of users || []) {
      if (!user.push_subscription && !user.fcm_token) {
        results.noSubscription++;
        continue;
      }

      let sent = false;

      // Try FCM first
      if (user.fcm_token) {
        const fcmResult = await sendFcmNotification(
          user.fcm_token,
          title,
          body,
          notificationData
        );

        if (fcmResult.success) {
          results.fcm.sent++;
          sent = true;
        } else {
          results.fcm.failed++;
          invalidFcmTokenUserIds.push(user.id);
        }
      }

      // Try Web Push if FCM didn't work
      if (!sent && user.push_subscription) {
        const subscription =
          typeof user.push_subscription === 'string'
            ? JSON.parse(user.push_subscription)
            : user.push_subscription;

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
      await supabase
        .from('users')
        .update({ fcm_token: null, fcm_platform: null, fcm_updated_at: null })
        .in('id', invalidFcmTokenUserIds);
    }

    if (invalidWebPushUserIds.length > 0) {
      await supabase
        .from('users')
        .update({ push_subscription: null })
        .in('id', invalidWebPushUserIds);
    }

    return NextResponse.json({
      success: true,
      results
    });
  } catch (error: any) {
    console.error('Error in batch notification send API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
