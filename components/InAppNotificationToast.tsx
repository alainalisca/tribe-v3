'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell } from 'lucide-react';

interface NotificationPayload {
  title?: string;
  body?: string;
  url?: string;
  data?: Record<string, string>;
}

export default function InAppNotificationToast() {
  const [notification, setNotification] = useState<NotificationPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartY = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Wait for slide-out animation to finish before clearing
    setTimeout(() => setNotification(null), 300);
  }, []);

  useEffect(() => {
    function handleNotification(e: Event) {
      const detail = (e as CustomEvent<NotificationPayload>).detail;
      if (!detail?.title) return;

      // Clear any existing timer
      if (timerRef.current) clearTimeout(timerRef.current);

      setNotification(detail);
      // Trigger slide-in on next frame
      requestAnimationFrame(() => setVisible(true));

      timerRef.current = setTimeout(dismiss, 4000);
    }

    window.addEventListener('tribe-foreground-notification', handleNotification);
    return () => {
      window.removeEventListener('tribe-foreground-notification', handleNotification);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  function handleTap() {
    const url = notification?.url || notification?.data?.url;
    dismiss();
    if (url) window.location.href = url;
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    // Swipe up to dismiss (threshold: 30px)
    if (deltaY < -30) dismiss();
  }

  if (!notification) return null;

  return (
    <div
      role="alert"
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="in-app-toast-container"
      style={{ transform: visible ? 'translateY(0)' : 'translateY(-120%)' }}
    >
      <div className="in-app-toast">
        <div className="in-app-toast-icon">
          <Bell className="w-5 h-5 text-[#C0E863]" />
        </div>
        <div className="in-app-toast-content">
          <p className="in-app-toast-title">{notification.title}</p>
          {notification.body && <p className="in-app-toast-body">{notification.body}</p>}
        </div>
      </div>

      <style jsx>{`
        .in-app-toast-container {
          position: fixed;
          top: calc(max(env(safe-area-inset-top, 0px), 12px) + 8px);
          left: 12px;
          right: 12px;
          z-index: 9999;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
        }
        .in-app-toast {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: #272d34;
          border-left: 4px solid #c0e863;
          border-radius: 12px;
          padding: 14px 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
        }
        .in-app-toast-icon {
          flex-shrink: 0;
          margin-top: 1px;
        }
        .in-app-toast-content {
          flex: 1;
          min-width: 0;
        }
        .in-app-toast-title {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          line-height: 1.3;
          margin: 0;
        }
        .in-app-toast-body {
          font-size: 13px;
          color: #b0b8c1;
          line-height: 1.4;
          margin: 2px 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
      `}</style>
    </div>
  );
}
