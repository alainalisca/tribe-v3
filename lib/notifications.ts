import { createClient } from '@/lib/supabase/client';

export async function requestNotificationPermission(userId: string) {
  // Check if browser supports notifications
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return null;
  }

  // Check if service worker is ready
  const registration = await navigator.serviceWorker.ready;
  
  // Request permission
  const permission = await Notification.requestPermission();
  
  if (permission !== 'granted') {
    console.log('Notification permission denied');
    return null;
  }

  // Get VAPID public key from environment
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  
  if (!vapidPublicKey) {
    console.error('VAPID public key not found');
    return null;
  }

  try {
    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });

    // Save subscription to Supabase
    const supabase = createClient();
    const { error } = await supabase
      .from('users')
      .update({ push_subscription: subscription.toJSON() })
      .eq('id', userId);

    if (error) {
      console.error('Error saving push subscription:', error);
      return null;
    }

    console.log('Push notification subscription saved successfully');
    return subscription;
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return null;
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
