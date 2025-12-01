'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      registerAndSubscribe();
    }
  }, []);

  async function registerAndSubscribe() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('Notification permission denied');
          return;
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          console.error('VAPID public key not found');
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await supabase
          .from('users')
          .update({ push_subscription: JSON.stringify(subscription) })
          .eq('id', user.id);
        console.log('Push subscription saved');
      }
    } catch (error) {
      console.error('Push registration failed:', error);
    }
  }

  return null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
