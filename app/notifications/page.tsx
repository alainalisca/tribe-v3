/** Page: /notifications — Notification center with type icons, animations, and mark-all-read */
'use client';

import { trackEvent } from '@/lib/analytics';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react';
import { m } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import { createClient } from '@/lib/supabase/client';
import { useNotifications } from './useNotifications';
import type { NotificationWithActor } from '@/lib/dal/notifications';
import NotificationSender, { senderName } from './NotificationSender';
import { useTranslations } from '@/lib/i18n/useTranslations';


export function getNotificationLink(notification: NotificationWithActor): string | null {
  const { type, entity_type, entity_id, actor_id, action_url } = notification;

  // AN EXPLICIT DESTINATION WINS OVER EVERY INFERRED ONE.
  //
  // Migration 182 added notifications.action_url because entity_id is uuid and
  // cannot carry an invite token. Without this branch the column would be
  // written and never read -- the same shape as the bug it exists to fix,
  // where the token was minted, stored, and never delivered.
  //
  // It is checked FIRST so a type-based rule can never quietly outrank the
  // destination the sender actually chose. `session_invite` is not in the list
  // below at all, so before this it fell through to null and the notification
  // was not even tappable.
  if (action_url) return action_url;
  if (type === 'follow' && actor_id) return `/profile/${actor_id}`;
  if (
    // T-NOTIF1: leave + approve/decline notifications also click through to the session.
    [
      'session_join',
      'session_leave',
      'session_reminder',
      'session_update',
      'review',
      'join_request_approved',
      'join_request_declined',
    ].includes(type) &&
    entity_type === 'session' &&
    entity_id
  )
    return `/session/${entity_id}`;
  // T-PROF1: the incomplete-profile nudge sends the instructor to edit their profile.
  if (type === 'profile_incomplete') return '/profile/edit';
  if (['dm', 'new_message'].includes(type) && entity_id) return `/messages/${entity_id}`;
  if (['community_invite', 'community_post'].includes(type) && entity_id) return `/communities/${entity_id}`;
  if (type === 'connection_request' && actor_id) return `/profile/${actor_id}`;
  // Gate 4b: the generation notice sends instructors to their dashboard, where
  // the recurring-series section lives. Trailing slash: trailingSlash is on and
  // a 308 would strip the auth headers.
  if (type === 'series_occurrences_generated') return '/dashboard/instructor/';
  // T-GYM2: the gym's request lands on its queue; the instructor's verdict
  // lands on the session it is about. Trailing slash on the dashboard for the
  // same reason as above -- trailingSlash is on and a 308 strips auth headers.
  if (type === 'venue_request_new') return '/dashboard/partner/';
  if (['venue_request_approved', 'venue_request_declined'].includes(type) && entity_id) return `/session/${entity_id}`;
  // Both partner bells go to the admin queue, which is where the admin acts on
  // them. entity_id is the featured_partners row and there is no per-partner
  // admin route, so the queue is the destination for both. Trailing slash for
  // the same reason as the dashboards above: trailingSlash is on and a 308
  // strips the auth headers.
  if (['partner_application', 'partner_activated'].includes(type)) return '/admin/partners/';
  return null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const tNotif = useTranslations('notif');
  const unknownSenderLabel = tNotif('unknownSender');
  const { t, notifications, loading, error, handleMarkRead, handleMarkAllRead, formatTime } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  async function handleNotificationTap(notification: NotificationWithActor) {
    trackEvent('notification_tapped', { notification_type: notification.type });
    if (!notification.is_read) {
      handleMarkRead(notification.id);
    }
    // T-INV1: a session invite routes to the /invite/{token} acceptance flow.
    // The token is not stored on the notification (entity_id is a uuid), so
    // resolve the inviter's latest unexpired token for this session; fall back
    // to the session page if none is left.
    if (notification.type === 'session_invite' && notification.entity_type === 'session' && notification.entity_id) {
      // RLS-H2: resolve the token via the caller-scoped definer RPC (no raw
      // invite_tokens read). It returns the token only because THIS caller holds a
      // session_invite notification for the session; token stays in one place.
      const { data: token } = await createClient().rpc('get_invite_token_for_notification', {
        p_session_id: notification.entity_id,
      });
      if (token) {
        router.push(`/invite/${token}`);
        return;
      }
      router.push(`/session/${notification.entity_id}`);
      return;
    }
    const link = getNotificationLink(notification);
    if (link) router.push(link);
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-nav">
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
              <m.button
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
                {/* Sender: a person whenever actor_id is set, the type icon only
                    when it is not. See NotificationSender.tsx. */}
                <NotificationSender notification={notification} unknownSenderLabel={unknownSenderLabel} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {senderName(notification, unknownSenderLabel) && (
                    <p className="text-xs font-semibold text-stone-900 dark:text-white mb-0.5">
                      {senderName(notification, unknownSenderLabel)}
                    </p>
                  )}
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
              </m.button>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
