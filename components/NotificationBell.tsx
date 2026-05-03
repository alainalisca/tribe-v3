'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getUnreadNotificationCount } from '@/lib/dal/notifications';

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let isMounted = true;

    // Get current user
    const getCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      // Fetch unread count
      const result = await getUnreadNotificationCount(supabase, user.id);
      if (isMounted && result.success) {
        setUnreadCount(result.data ?? 0);
      }
      setLoading(false);
    };

    getCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  // Poll every 30 seconds for unread count
  useEffect(() => {
    const interval = setInterval(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const result = await getUnreadNotificationCount(supabase, user.id);
      if (result.success) {
        setUnreadCount(result.data ?? 0);
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [supabase]);

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
