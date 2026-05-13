'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';
import { updateUser } from '@/lib/dal';

/**
 * Registers the service worker on every page load. Only subscribes to
 * push when the user has ALREADY granted notification permission
 * elsewhere — never auto-prompts. The prior behavior called
 * `Notification.requestPermission()` unconditionally if there was no
 * subscription yet, which meant any user who closed the browser's
 * permission dialog with the X (instead of Block / Allow) got
 * re-prompted on every page load, since the permission state stayed
 * at 'default'.
 *
 * The "ask the user nicely" flow now lives entirely in
 * `components/NotificationPrompt.tsx` (in-app toast with Enable / Later
 * buttons) and `lib/firebase-messaging.ts#registerForPushNotifications`.
 * That path:
 *   - Shows the in-app prompt at most once per device (localStorage
 *     gates it)
 *   - Only calls `requestPermission()` when the user clicks Enable
 *   - Persists the choice so we never re-ask
 *
 * This component's job is just to be ready: register the SW, persist
 * the subscription IF permission is granted. The very first time the
 * user grants permission via NotificationPrompt, that flow saves the
 * subscription itself; this component handles the second-visit case
 * where permission was already granted but the SW hasn't picked up
 * the existing subscription yet.
 */
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
        // CRITICAL: don't auto-prompt. Only attempt to subscribe when
        // the user has already granted permission through the in-app
        // NotificationPrompt flow. Otherwise we exit silently and let
        // that component own the ask.
        const permission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
        if (permission !== 'granted') {
          log('debug', 'sw_skip_subscribe_no_permission', {
            action: 'registerAndSubscribe',
            permission,
          });
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
