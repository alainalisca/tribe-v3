import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';
import { updateUser } from '@/lib/dal';

// Check if running in native Capacitor app
export const isNativeApp = () => {
  return Capacitor.isNativePlatform();
};

// Check if running on specific platform
export const getPlatform = () => {
  return Capacitor.getPlatform(); // 'ios', 'android', or 'web'
};

// Initialize Firebase Messaging for native apps
export async function initializeFirebaseMessaging(userId: string): Promise<string | null> {
  if (!isNativeApp()) {
    log('debug', 'Not a native app, use web push instead', { action: 'initializeFirebaseMessaging' });
    return null;
  }

  try {
    log('debug', 'Requesting notification permissions', { action: 'initializeFirebaseMessaging', userId });
    // Request permission for notifications
    const permissionResult = await FirebaseMessaging.requestPermissions();
    log('debug', 'Permission result received', {
      action: 'initializeFirebaseMessaging',
      permissionResult: JSON.stringify(permissionResult),
    });

    if (permissionResult.receive !== 'granted') {
      log('debug', 'Push notification permission denied', { action: 'initializeFirebaseMessaging', userId });
      return null;
    }

    // Delete old token to force a fresh one (clears stale NotRegistered tokens)
    try {
      await FirebaseMessaging.deleteToken();
    } catch {
      // Token may not exist yet, that's fine
    }

    // Get a fresh FCM token
    log('debug', 'Getting FCM token', { action: 'initializeFirebaseMessaging', userId });
    const tokenResult = await FirebaseMessaging.getToken();
    const token = tokenResult.token;
    log('debug', 'FCM token received', {
      action: 'initializeFirebaseMessaging',
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
    });

    if (!token) {
      log('error', 'Failed to get FCM token - token is empty', { action: 'initializeFirebaseMessaging', userId });
      return null;
    }

    // Save token to Supabase
    log('debug', 'Saving FCM token to Supabase', { action: 'initializeFirebaseMessaging', userId });
    await saveFcmToken(userId, token);
    console.log('[FCM] New token registered:', token.substring(0, 20) + '...');

    // Set up token refresh listener
    setupTokenRefreshListener(userId);

    // Set up foreground notification listener
    setupForegroundNotificationListener();

    // Set up notification tap listener
    setupNotificationTapListener();

    log('info', 'Firebase Messaging initialized successfully', { action: 'initializeFirebaseMessaging', userId });
    return token;
  } catch (error) {
    logError(error, { action: 'initializeFirebaseMessaging', userId });
    return null;
  }
}

// Save FCM token to Supabase
async function saveFcmToken(userId: string, token: string): Promise<void> {
  const supabase = createClient();
  const platform = getPlatform();

  log('debug', 'saveFcmToken called', {
    action: 'saveFcmToken',
    userId,
    platform,
    tokenPreview: token.substring(0, 20) + '...',
  });

  const result = await updateUser(supabase, userId, {
    fcm_token: token,
    fcm_platform: platform,
    fcm_updated_at: new Date().toISOString(),
  });

  if (!result.success) {
    log('error', 'Error saving FCM token', {
      action: 'saveFcmToken',
      userId,
      errorMessage: result.error || 'Unknown error',
    });
  } else {
    log('info', 'FCM token saved successfully', { action: 'saveFcmToken', userId });
  }
}

// Set up listener for token refresh
function setupTokenRefreshListener(userId: string): void {
  FirebaseMessaging.addListener('tokenReceived', async (event) => {
    log('info', 'FCM token refreshed', {
      action: 'setupTokenRefreshListener',
      userId,
      tokenPreview: event.token.substring(0, 20) + '...',
    });
    await saveFcmToken(userId, event.token);
  });
}

// Set up listener for foreground notifications
function setupForegroundNotificationListener(): void {
  FirebaseMessaging.addListener('notificationReceived', (event) => {
    log('debug', 'Notification received in foreground', {
      action: 'setupForegroundNotificationListener',
      notification: JSON.stringify(event.notification),
    });

    const notification = event.notification;
    const data = notification.data as Record<string, string> | undefined;

    if (notification.title) {
      log('debug', 'Foreground notification displayed', {
        action: 'setupForegroundNotificationListener',
        title: notification.title,
        body: notification.body,
      });

      // Show in-app toast via custom event
      window.dispatchEvent(
        new CustomEvent('tribe-foreground-notification', {
          detail: {
            title: notification.title,
            body: notification.body,
            url: data?.url,
            data,
          },
        })
      );
    }
  });
}

// Set up listener for notification taps
function setupNotificationTapListener(): void {
  FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    log('debug', 'Notification tapped', { action: 'setupNotificationTapListener', event: JSON.stringify(event) });

    const data = event.notification?.data as Record<string, string> | undefined;

    // Handle navigation based on notification data
    if (data?.url) {
      window.location.href = data.url;
    } else if (data?.type === 'chat_message' && data.sessionId) {
      window.location.href = `/session/${data.sessionId}`;
    } else if (data?.sessionId) {
      window.location.href = `/session/${data.sessionId}`;
    }
  });
}

// Remove FCM token (for logout)
export async function removeFcmToken(userId: string): Promise<void> {
  if (!isNativeApp()) return;

  try {
    // Delete token from Firebase
    await FirebaseMessaging.deleteToken();

    // Remove token from Supabase
    const supabase = createClient();
    await updateUser(supabase, userId, {
      fcm_token: null,
      fcm_platform: null,
      fcm_updated_at: null,
    });

    // Remove all listeners
    await FirebaseMessaging.removeAllListeners();

    log('info', 'FCM token removed successfully', { action: 'removeFcmToken', userId });
  } catch (error) {
    logError(error, { action: 'removeFcmToken', userId });
  }
}

// Check notification permission status
export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isNativeApp()) {
    // For web, use standard Notification API
    if (!('Notification' in window)) return 'denied';
    return Notification.permission as 'granted' | 'denied' | 'prompt';
  }

  const result = await FirebaseMessaging.checkPermissions();

  switch (result.receive) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'prompt';
  }
}

// Get current FCM token (if already registered)
export async function getCurrentFcmToken(): Promise<string | null> {
  if (!isNativeApp()) return null;

  try {
    const result = await FirebaseMessaging.getToken();
    return result.token || null;
  } catch (error) {
    logError(error, { action: 'getCurrentFcmToken' });
    return null;
  }
}

// Subscribe to a topic (useful for broadcast notifications)
export async function subscribeToTopic(topic: string): Promise<void> {
  if (!isNativeApp()) return;

  try {
    await FirebaseMessaging.subscribeToTopic({ topic });
    log('info', 'Subscribed to topic', { action: 'subscribeToTopic', topic });
  } catch (error) {
    logError(error, { action: 'subscribeToTopic', topic });
  }
}

// Unsubscribe from a topic
export async function unsubscribeFromTopic(topic: string): Promise<void> {
  if (!isNativeApp()) return;

  try {
    await FirebaseMessaging.unsubscribeFromTopic({ topic });
    log('info', 'Unsubscribed from topic', { action: 'unsubscribeFromTopic', topic });
  } catch (error) {
    logError(error, { action: 'unsubscribeFromTopic', topic });
  }
}

// Unified notification registration that handles both native and web
export async function registerForPushNotifications(userId: string): Promise<boolean> {
  log('debug', 'registerForPushNotifications called', {
    action: 'registerForPushNotifications',
    userId,
    isNative: isNativeApp(),
    platform: getPlatform(),
  });

  if (isNativeApp()) {
    // Use FCM for native apps
    const token = await initializeFirebaseMessaging(userId);
    log('debug', 'Native registration complete', {
      action: 'registerForPushNotifications',
      userId,
      tokenObtained: token !== null,
    });
    return token !== null;
  } else {
    // Use web push for browser
    log('debug', 'Using web push for browser', { action: 'registerForPushNotifications', userId });
    const { requestNotificationPermission } = await import('@/lib/notifications');
    const subscription = await requestNotificationPermission(userId);
    log('debug', 'Web push registration complete', {
      action: 'registerForPushNotifications',
      userId,
      subscriptionObtained: subscription !== null,
    });
    return subscription !== null;
  }
}
