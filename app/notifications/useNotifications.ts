'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationWithActor,
} from '@/lib/dal/notifications';
import { getNotificationTranslations } from './translations';

export function useNotifications() {
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getNotificationTranslations(language);

  const [notifications, setNotifications] = useState<NotificationWithActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadNotifications = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !isMounted) return;

      const result = await fetchNotifications(supabase, user.id, 50, 0);
      if (isMounted) {
        if (result.success) {
          setNotifications(result.data || []);
          setError(null);
        } else {
          setError(result.error || 'Failed to load notifications');
        }
        setLoading(false);
      }
    };

    loadNotifications();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const handleMarkRead = async (notificationId: string) => {
    const result = await markNotificationRead(supabase, notificationId);
    if (result.success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    }
  };

  const handleMarkAllRead = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const result = await markAllNotificationsRead(supabase, user.id);
    if (result.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  const formatTime = (createdAt: string) => {
    const now = new Date();
    const created = new Date(createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return language === 'es' ? 'ahora' : 'now';
    if (diffMins < 60)
      return language === 'es' ? `${diffMins}m atrás` : `${diffMins}m ago`;
    if (diffHours < 24)
      return language === 'es' ? `${diffHours}h atrás` : `${diffHours}h ago`;
    if (diffDays < 7)
      return language === 'es' ? `${diffDays}d atrás` : `${diffDays}d ago`;

    return created.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US');
  };

  return {
    t,
    notifications,
    loading,
    error,
    handleMarkRead,
    handleMarkAllRead,
    formatTime,
  };
}
