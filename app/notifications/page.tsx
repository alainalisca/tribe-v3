/** Page: /notifications — Notification center with type icons, animations, and mark-all-read */
'use client';

import { trackEvent } from '@/lib/analytics';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, Calendar, MessageCircle, Users, Star, Gift, Zap, CheckCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import { useNotifications } from './useNotifications';
import type { NotificationWithActor } from '@/lib/dal/notifications';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  session_reminder: <Calendar className="w-5 h-5 text-tribe-green" />,
  session_update: <Calendar className="w-5 h-5 text-blue-400" />,
  session_join: <Users className="w-5 h-5 text-tribe-green" />,
  new_message: <MessageCircle className="w-5 h-5 text-tribe-green" />,
  dm: <MessageCircle className="w-5 h-5 text-tribe-green" />,
  connection_request: <Users className="w-5 h-5 text-amber-500" />,
  follow: <Users className="w-5 h-5 text-amber-500" />,
  review: <Star className="w-5 h-5 text-yellow-500" />,
  review_received: <Star className="w-5 h-5 text-yellow-500" />,
  referral_complete: <Gift className="w-5 h-5 text-amber-500" />,
  referral_converted: <Gift className="w-5 h-5 text-amber-500" />,
  streak_milestone: <Zap className="w-5 h-5 text-amber-500" />,
  achievement: <Zap className="w-5 h-5 text-amber-500" />,
  general: <Bell className="w-5 h-5 text-stone-400" />,
};

function getNotificationLink(notification: NotificationWithActor): string | null {
  const { type, entity_type, entity_id, actor_id } = notification;
  if (type === 'follow' && actor_id) return `/profile/${actor_id}`;
  if (
    ['session_join', 'session_reminder', 'session_update', 'review'].includes(type) &&
    entity_type === 'session' &&
    entity_id
  )
    return `/session/${entity_id}`;
  if (['dm', 'new_message'].includes(type) && entity_id) return `/messages/${entity_id}`;
  if (['community_invite', 'community_post'].includes(type) && entity_id) return `/communities/${entity_id}`;
  if (type === 'connection_request' && actor_id) return `/profile/${actor_id}`;
  return null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { t, notifications, loading, error, handleMarkRead, handleMarkAllRead, formatTime } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function handleNotificationTap(notification: NotificationWithActor) {
    trackEvent('notification_tapped', { notification_type: notification.type });
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }
    const link = getNotificationLink(notification);
    if (link) router.push(link);
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-card border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white hover:opacity-70" />
            </Link>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-stone-900 dark:text-white">{t.notifications}</h1>
              {unreadCount > 0 && (
                <span className="bg-tribe-green text-slate-900 text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 text-sm font-semibold text-tribe-green hover:text-lime-500 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              {t.markAllAsRead}
            </button>
          )}
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="animate-pulse flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-tribe-surface"
              >
                <div className="w-10 h-10 bg-stone-200 dark:bg-tribe-mid rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-3/4" />
                  <div className="h-3 bg-stone-200 dark:bg-tribe-mid rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <p className="text-stone-900 dark:text-white text-lg mb-4">{t.somethingWentWrong}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
            >
              {t.tryAgain}
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="mb-4 p-5 bg-white dark:bg-tribe-surface rounded-full">
              <Bell className="w-12 h-12 text-stone-300 dark:text-stone-500" />
            </div>
            <p className="text-stone-500 dark:text-stone-400 text-center text-sm">{t.noNotifications}</p>
          </div>
        )}

        {/* Notification list */}
        {!loading && !error && notifications.length > 0 && (
          <div className="space-y-2">
            {notifications.map((notification, index) => (
              <motion.button
                key={notification.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.25 }}
                onClick={() => handleNotificationTap(notification)}
                className={`w-full text-left flex items-start gap-3 p-4 rounded-xl transition-colors ${
                  notification.is_read
                    ? 'bg-white dark:bg-tribe-surface'
                    : 'bg-tribe-green/10 dark:bg-tribe-green/5 border border-tribe-green/20'
                }`}
              >
                {/* Type icon */}
                <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-tribe-mid flex items-center justify-center flex-shrink-0 mt-0.5">
                  {notification.actor?.avatar_url ? (
                    <img
                      src={notification.actor.avatar_url}
                      alt={notification.actor.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    TYPE_ICONS[notification.type] || TYPE_ICONS.general
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm leading-relaxed ${
                      notification.is_read
                        ? 'text-stone-700 dark:text-stone-300'
                        : 'font-semibold text-stone-900 dark:text-white'
                    }`}
                  >
                    {notification.message}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                    {formatTime(notification.created_at)}
                  </p>
                </div>

                {/* Unread dot */}
                {!notification.is_read && (
                  <div className="w-2.5 h-2.5 rounded-full bg-tribe-green flex-shrink-0 mt-2" />
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
