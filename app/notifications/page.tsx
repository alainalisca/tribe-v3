/** Page: /notifications — Activity feed of notifications */
'use client';

import Link from 'next/link';
import {
  UserPlus,
  Heart,
  MessageCircle,
  Star,
  Users,
  MessageSquare,
  Gift,
  Target,
  FileText,
  Trophy,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import BottomNav from '@/components/BottomNav';
import { useNotifications } from './useNotifications';
import type { NotificationWithActor } from '@/lib/dal/notifications';

// Mapping of notification type to icon component
const typeIconMap: Record<string, React.ReactNode> = {
  follow: <UserPlus className="w-5 h-5 flex-shrink-0" />,
  like: <Heart className="w-5 h-5 flex-shrink-0 text-red-500" />,
  comment: <MessageCircle className="w-5 h-5 flex-shrink-0" />,
  review: <Star className="w-5 h-5 flex-shrink-0 text-yellow-500" />,
  session_join: <Users className="w-5 h-5 flex-shrink-0" />,
  dm: <MessageSquare className="w-5 h-5 flex-shrink-0" />,
  community_invite: <Users className="w-5 h-5 flex-shrink-0" />,
  achievement: <Trophy className="w-5 h-5 flex-shrink-0 text-purple-500" />,
  referral_complete: <Gift className="w-5 h-5 flex-shrink-0 text-green-500" />,
  challenge_complete: <Target className="w-5 h-5 flex-shrink-0" />,
  community_post: <FileText className="w-5 h-5 flex-shrink-0" />,
};

/**
 * Helper to get the URL to navigate to based on notification type and entity.
 */
function getNotificationLink(notification: NotificationWithActor): string {
  const { type, entity_type, entity_id, actor_id } = notification;

  if (type === 'follow' && actor_id) {
    // Navigate to actor's profile
    return `/profile/${actor_id}`;
  }

  if (type === 'like' && entity_type === 'post' && entity_id) {
    // Navigate to the post (you may need to create a /posts/[id] route or adjust as needed)
    return `/posts/${entity_id}`;
  }

  if (type === 'comment' && entity_type === 'post' && entity_id) {
    return `/posts/${entity_id}`;
  }

  if (type === 'review' && entity_type === 'session' && entity_id) {
    return `/sessions/${entity_id}`;
  }

  if (type === 'session_join' && entity_type === 'session' && entity_id) {
    return `/sessions/${entity_id}`;
  }

  if (type === 'dm' && entity_id) {
    // Navigate to conversation
    return `/messages/${entity_id}`;
  }

  if (type === 'community_invite' && entity_type === 'community' && entity_id) {
    return `/communities/${entity_id}`;
  }

  if (type === 'community_post' && entity_type === 'community' && entity_id) {
    return `/communities/${entity_id}`;
  }

  if (type === 'challenge_complete' && entity_type === 'challenge' && entity_id) {
    return `/challenges/${entity_id}`;
  }

  // Default: go to notifications page
  return '/notifications';
}

export default function NotificationsPage() {
  const { t, notifications, loading, error, handleMarkRead, handleMarkAllRead, formatTime } = useNotifications();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
          <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.notifications}</h1>
          </div>
        </div>
        <div className="pt-header max-w-2xl mx-auto p-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="dark:bg-tribe-card shadow-none animate-pulse">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-stone-200 dark:bg-tribe-mid rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-2/3 mb-2" />
                      <div className="h-3 bg-stone-200 dark:bg-tribe-mid rounded w-1/2" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid flex flex-col items-center justify-center p-4">
        <p className="text-stone-900 dark:text-white text-lg mb-4">{t.somethingWentWrong}</p>
        <Button onClick={() => window.location.reload()} className="font-bold">
          {t.tryAgain}
        </Button>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.notifications}</h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-sm font-semibold text-[#9EE551] hover:text-[#8FD642] transition-colors"
            >
              {t.markAllAsRead}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="pt-header max-w-2xl mx-auto p-4">
        {notifications.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="mb-4 p-4 bg-white dark:bg-tribe-surface rounded-full">
              <Bell className="w-12 h-12 text-stone-400 dark:text-stone-500" />
            </div>
            <p className="text-stone-600 dark:text-stone-300 text-center">{t.noNotifications}</p>
          </div>
        ) : (
          // Notification list
          <div className="space-y-2">
            {notifications.map((notification) => (
              <Link key={notification.id} href={getNotificationLink(notification)}>
                <Card
                  className={`dark:bg-tribe-mid shadow-none border-l-4 transition-colors cursor-pointer hover:bg-stone-100 dark:hover:bg-tribe-card ${
                    notification.is_read ? 'border-l-stone-300 dark:border-l-stone-600' : 'border-l-[#A3E635]'
                  }`}
                  onClick={(e) => {
                    // Mark as read when clicked
                    if (!notification.is_read) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleMarkRead(notification.id);
                      // Navigate after marking as read
                      setTimeout(() => {
                        window.location.href = getNotificationLink(notification);
                      }, 100);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Actor avatar or system icon */}
                      <div className="flex-shrink-0 mt-1">
                        {notification.actor?.avatar_url ? (
                          <img
                            src={notification.actor.avatar_url}
                            alt={notification.actor.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-white dark:bg-tribe-surface flex items-center justify-center text-stone-600 dark:text-stone-300">
                            {typeIconMap[notification.type] || <Bell className="w-5 h-5" />}
                          </div>
                        )}
                      </div>

                      {/* Message and timestamp */}
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

                      {/* Unread indicator and chevron */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {!notification.is_read && <div className="w-2 h-2 rounded-full bg-tribe-green-light" />}
                        <ChevronRight className="w-5 h-5 text-stone-400 dark:text-stone-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
