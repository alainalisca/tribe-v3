'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getUnreadNotificationCount } from '@/lib/dal/notifications';

/**
 * NotificationBell — header bell with unread badge.
 *
 * Previously polled `auth.getUser()` every 30s on every page, which was 120
 * round-trips per hour per user just to refresh a count. Now: fetches the
 * user once, subscribes to a Supabase realtime channel on the `notifications`
 * table filtered to this recipient, and re-counts on INSERT/UPDATE/DELETE.
 * Realtime keeps the badge fresh without polling; the 5-minute fallback
 * interval is a safety net in case the realtime socket drops (e.g. background
 * tab on mobile after sleep).
 */
export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Resolve the current user once.
  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Once we know the user, fetch their unread count and subscribe to THEIR
  // notifications only.
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let isMounted = true;

    async function refreshCount() {
      const result = await getUnreadNotificationCount(supabase, userId!);
      if (isMounted && result.success) setUnreadCount(result.data ?? 0);
    }

    refreshCount().finally(() => {
      if (isMounted) setLoading(false);
    });

    // T3-6: the previous subscription used a shared channel name
    // ('notifications-bell') and NO row filter, so every user's bell woke up
    // and re-counted on every other user's notification — O(users × events)
    // realtime fanout. Filter to this recipient and use a per-user channel.
    const channel = supabase
      .channel(`notifications-bell-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        () => {
          void refreshCount();
        }
      )
      .subscribe();

    // Safety-net poll every 5 minutes in case the realtime socket drops
    // (mobile backgrounded tabs, flaky networks).
    const interval = setInterval(() => {
      void refreshCount();
    }, 300_000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="w-10 h-10 flex items-center justify-center">
        <Bell className="w-6 h-6 text-stone-600 dark:text-stone-300" />
      </div>
    );
  }

  return (
    <Link
      href="/notifications"
      aria-label="Notifications"
      className="relative w-10 h-10 flex items-center justify-center"
    >
      <Bell className="w-6 h-6 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white transition-colors" />
      {unreadCount > 0 && (
        // Smaller, tighter badge so it sits clearly inside the bell's bounds
        // instead of bleeding into the wordmark next to it. Uses the brand
        // red token + a ring matching the header background so the badge
        // reads as an inset chip rather than free-floating text.
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center bg-tribe-red text-white text-[10px] font-bold rounded-full ring-2 ring-stone-200 dark:ring-tribe-dark">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
