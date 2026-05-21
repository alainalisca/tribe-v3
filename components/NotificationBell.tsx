'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function refreshCount(userId: string) {
      const result = await getUnreadNotificationCount(supabase, userId);
      if (isMounted && result.success) {
        setUnreadCount(result.data ?? 0);
      }
    }

    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !isMounted) {
        setLoading(false);
        return;
      }
      userIdRef.current = user.id;
      await refreshCount(user.id);
      setLoading(false);
    }

    bootstrap();

    // Realtime subscription: refresh on any change to this user's notifications.
    const channel = supabase
      .channel('notifications-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        if (userIdRef.current) void refreshCount(userIdRef.current);
      })
      .subscribe();

    // Safety-net poll every 5 minutes in case the realtime socket drops
    // (mobile backgrounded tabs, flaky networks). Way less chatty than the
    // old 30s poll, and only fires the count query — no auth round-trip.
    const interval = setInterval(() => {
      if (userIdRef.current) void refreshCount(userIdRef.current);
    }, 300_000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, []);

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
