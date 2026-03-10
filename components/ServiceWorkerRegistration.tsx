'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';
import { updateUser } from '@/lib/dal';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator && 'PushManager' in window)) return;
    // Defer SW registration to avoid blocking initial render and scroll
    const id = setTimeout(() => registerAndSubscribe(), 5000);
    return () => clearTimeout(id);
  }, []);

  async function registerAndSubscribe() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      log('debug', 'Service Worker registered', { scope: registration.scope });
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          log('debug', 'Notification permission denied', { action: 'registerAndSubscribe' });
          return;
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          log('error', 'VAPID public key not found', { action: 'registerAndSubscribe' });
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await updateUser(supabase, user.id, { push_subscription: JSON.stringify(subscription) });
        log('debug', 'Push subscription saved', { userId: user.id });
      }
    } catch (error) {
      logError(error, { action: 'registerAndSubscribe' });
    }
  }

  return null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
