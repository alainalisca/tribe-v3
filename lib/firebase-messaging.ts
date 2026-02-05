import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { createClient } from '@/lib/supabase/client';

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
    console.log('[FCM] Not a native app, use web push instead');
    return null;
  }

  try {
    console.log('[FCM] Requesting notification permissions...');
    // Request permission for notifications
    const permissionResult = await FirebaseMessaging.requestPermissions();
    console.log('[FCM] Permission result:', JSON.stringify(permissionResult));

    if (permissionResult.receive !== 'granted') {
      console.log('[FCM] Push notification permission denied');
      return null;
    }

    // Get the FCM token
    console.log('[FCM] Getting FCM token...');
    const tokenResult = await FirebaseMessaging.getToken();
    const token = tokenResult.token;
    console.log('[FCM] Token received:', token ? `${token.substring(0, 20)}...` : 'null');

    if (!token) {
      console.error('[FCM] Failed to get FCM token - token is empty');
      return null;
    }

    // Save token to Supabase
    console.log('[FCM] Saving token to Supabase for user:', userId);
    await saveFcmToken(userId, token);

    // Set up token refresh listener
    setupTokenRefreshListener(userId);

    // Set up foreground notification listener
    setupForegroundNotificationListener();

    // Set up notification tap listener
    setupNotificationTapListener();

    console.log('[FCM] Firebase Messaging initialized successfully');
    return token;
  } catch (error) {
    console.error('[FCM] Error initializing Firebase Messaging:', error);
    return null;
  }
}

// Save FCM token to Supabase
async function saveFcmToken(userId: string, token: string): Promise<void> {
  const supabase = createClient();
  const platform = getPlatform();

  console.log('[FCM] saveFcmToken called - userId:', userId, 'platform:', platform, 'token:', token.substring(0, 20) + '...');

  const { data, error } = await supabase
    .from('users')
    .update({
      fcm_token: token,
      fcm_platform: platform,
      fcm_updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select('id, fcm_token, fcm_platform');

  if (error) {
    console.error('[FCM] Error saving FCM token:', error.message, error.details, error.hint);
  } else {
    console.log('[FCM] FCM token saved successfully. Updated row:', JSON.stringify(data));
  }
}

// Set up listener for token refresh
function setupTokenRefreshListener(userId: string): void {
  FirebaseMessaging.addListener('tokenReceived', async (event) => {
    console.log('FCM token refreshed:', event.token);
    await saveFcmToken(userId, event.token);
  });
}

// Set up listener for foreground notifications
function setupForegroundNotificationListener(): void {
  FirebaseMessaging.addListener('notificationReceived', (event) => {
    console.log('Notification received in foreground:', event.notification);

    // You can show a local notification or update UI here
    // For now, we'll let the system handle it
    const notification = event.notification;

    // Optionally show a toast or in-app notification
    if (notification.title) {
      // Could trigger a toast notification here
      console.log(`[Notification] ${notification.title}: ${notification.body}`);
    }
  });
}

// Set up listener for notification taps
function setupNotificationTapListener(): void {
  FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
    console.log('Notification tapped:', event);

    const data = event.notification?.data;

    // Handle navigation based on notification data
    if (data?.url) {
      // Navigate to the specified URL
      window.location.href = data.url;
    } else if (data?.sessionId) {
      // Navigate to session details
      window.location.href = `/sessions/${data.sessionId}`;
    } else if (data?.type === 'chat') {
      // Navigate to chat
      window.location.href = `/chat/${data.chatId || ''}`;
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
    await supabase
      .from('users')
      .update({
        fcm_token: null,
        fcm_platform: null,
        fcm_updated_at: null
      })
      .eq('id', userId);

    // Remove all listeners
    await FirebaseMessaging.removeAllListeners();

    console.log('FCM token removed successfully');
  } catch (error) {
    console.error('Error removing FCM token:', error);
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
    console.error('Error getting current FCM token:', error);
    return null;
  }
}

// Subscribe to a topic (useful for broadcast notifications)
export async function subscribeToTopic(topic: string): Promise<void> {
  if (!isNativeApp()) return;

  try {
    await FirebaseMessaging.subscribeToTopic({ topic });
    console.log(`Subscribed to topic: ${topic}`);
  } catch (error) {
    console.error(`Error subscribing to topic ${topic}:`, error);
  }
}

// Unsubscribe from a topic
export async function unsubscribeFromTopic(topic: string): Promise<void> {
  if (!isNativeApp()) return;

  try {
    await FirebaseMessaging.unsubscribeFromTopic({ topic });
    console.log(`Unsubscribed from topic: ${topic}`);
  } catch (error) {
    console.error(`Error unsubscribing from topic ${topic}:`, error);
  }
}

// Unified notification registration that handles both native and web
export async function registerForPushNotifications(userId: string): Promise<boolean> {
  console.log('[FCM] registerForPushNotifications called - userId:', userId, 'isNative:', isNativeApp(), 'platform:', getPlatform());

  if (isNativeApp()) {
    // Use FCM for native apps
    const token = await initializeFirebaseMessaging(userId);
    console.log('[FCM] Native registration complete - token obtained:', token !== null);
    return token !== null;
  } else {
    // Use web push for browser
    console.log('[FCM] Using web push for browser');
    const { requestNotificationPermission } = await import('@/lib/notifications');
    const subscription = await requestNotificationPermission(userId);
    console.log('[FCM] Web push registration complete - subscription:', subscription !== null);
    return subscription !== null;
  }
}
