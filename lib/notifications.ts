import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';
import { updateUser } from '@/lib/dal';

export async function requestNotificationPermission(userId: string) {
  // Check if browser supports notifications
  if (!('Notification' in window)) {
    log('debug', 'This browser does not support notifications');
    return null;
  }

  // Check if service worker is ready
  const registration = await navigator.serviceWorker.ready;

  // Request permission
  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    log('debug', 'Notification permission denied');
    return null;
  }

  // Get VAPID public key from environment
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    log('error', 'VAPID public key not found', { action: 'requestNotificationPermission' });
    return null;
  }

  try {
    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Save subscription to Supabase
    const supabase = createClient();
    // REASON: PushSubscriptionJSON shape is compatible with Json but TS can't verify the index signature
    const result = await updateUser(supabase, userId, {
      push_subscription: JSON.parse(JSON.stringify(subscription.toJSON())),
    });

    if (!result.success) {
      logError(result.error, { action: 'requestNotificationPermission', userId });
      return null;
    }

    log('info', 'Push notification subscription saved successfully', { userId });
    return subscription;
  } catch (error) {
    logError(error, { action: 'requestNotificationPermission', userId });
    return null;
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
