import webpush from 'web-push';
import { log, logError } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const jwt = require('jsonwebtoken');

// Lazy-initialize web-push VAPID details to avoid build-time validation errors
// when env vars are placeholders (e.g. in CI)
let vapidInitialized = false;
function ensureVapidInitialized(): void {
  if (vapidInitialized) return;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  vapidInitialized = true;
}

// Get FCM access token via direct OAuth2 JWT exchange
export async function getFcmAccessToken(): Promise<string | null> {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccount) return null;

    const parsed = JSON.parse(serviceAccount);
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      {
        iss: parsed.client_email,
        sub: parsed.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
      },
      parsed.private_key,
      { algorithm: 'RS256' }
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
    });

    const data = await response.json();
    return data.access_token || null;
  } catch (error) {
    logError(error, { route: '/api/notifications/send', action: 'get_fcm_access_token' });
    return null;
  }
}

// Send notification via FCM HTTP v1 API (bypasses Firebase Admin SDK)
export async function sendFcmNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getFcmAccessToken();
  if (!accessToken) {
    return { success: false, error: 'Failed to obtain FCM access token' };
  }

  try {
    const projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!).project_id;

    const message = {
      message: {
        token: fcmToken,
        notification: { title, body },
        data: data || {},
        android: {
          priority: 'high',
          notification: { sound: 'default', channel_id: 'tribe_notifications' },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      },
    };

    log('debug', 'FCM HTTP v1 request prepared', {
      route: '/api/notifications/send',
      action: 'fcm_send',
      hasAccessToken: !!accessToken,
      tokenLength: accessToken?.length,
      projectId,
    });

    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    log('debug', 'FCM HTTP v1 response received', {
      route: '/api/notifications/send',
      action: 'fcm_response',
      status: response.status,
      result,
    });

    if (!response.ok) {
      const errorMsg = result.error?.message || JSON.stringify(result);
      log('error', 'FCM HTTP v1 error', { route: '/api/notifications/send', action: 'fcm_send', error: errorMsg });

      if (result.error?.code === 404 || result.error?.code === 400) {
        log('warn', 'Invalid FCM token, should be removed from database', {
          route: '/api/notifications/send',
          action: 'fcm_token_invalid',
        });
      }

      return { success: false, error: errorMsg };
    }

    log('info', 'FCM notification sent via HTTP v1', {
      route: '/api/notifications/send',
      action: 'fcm_sent',
      messageName: result.name,
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `FCM HTTP error: ${message}` };
  }
}

// Send notification via Web Push
export async function sendWebPushNotification(
  subscription: webpush.PushSubscription,
  title: string,
  body: string,
  url?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    ensureVapidInitialized();
    const payload = JSON.stringify({
      title,
      body,
      url: url || '/',
    });

    await webpush.sendNotification(subscription, payload);
    log('info', 'Web push notification sent successfully', {
      route: '/api/notifications/send',
      action: 'web_push_sent',
    });
    return { success: true };
  } catch (error: unknown) {
    const statusCode =
      error instanceof Error && 'statusCode' in error ? (error as { statusCode: number }).statusCode : undefined;
    const message = error instanceof Error ? error.message : String(error);
    const errorDetail = `Web push error: ${statusCode || 'unknown'} - ${message}`;
    logError(error, { route: '/api/notifications/send', action: 'web_push_send', statusCode });

    // Handle expired subscription
    if (statusCode === 410) {
      log('warn', 'Web push subscription expired, should be removed from database', {
        route: '/api/notifications/send',
        action: 'web_push_expired',
      });
    }

    return { success: false, error: errorDetail };
  }
}

/** Check if an FCM error indicates the token is invalid and should be removed */
export function isFcmTokenInvalid(error?: string): boolean {
  if (!error) return false;
  return error.includes('NOT_FOUND') || error.includes('INVALID_ARGUMENT') || error.includes('UNREGISTERED');
}
