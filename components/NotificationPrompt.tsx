'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { registerForPushNotifications } from '@/lib/firebase-messaging';
import { createClient } from '@/lib/supabase/client';
import { log, logError } from '@/lib/logger';
import { showInfo, showError as showErrorToast } from '@/lib/toast';
import { useLanguage } from '@/lib/LanguageContext';

interface NotificationPromptProps {
  hideWhenOnboarding?: boolean;
}

export default function NotificationPrompt({ hideWhenOnboarding = false }: NotificationPromptProps) {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Defer notification check — not needed for initial render
    const id = setTimeout(() => checkUser(), 6000);
    return () => clearTimeout(id);
  }, []);

  async function checkUser() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setUserId(user.id);

    const hasAsked = localStorage.getItem('notification-prompt-shown');
    const permission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied';

    if (!hasAsked && permission === 'default') {
      setTimeout(() => setShow(true), 5000);
    }
  }

  async function handleEnable() {
    if (!userId) return;

    setLoading(true);

    try {
      log('debug', 'NotificationPrompt: enabling for user', { userId });
      const success = await registerForPushNotifications(userId);
      log('debug', 'NotificationPrompt: registration result', { userId, success });

      if (success) {
        setShow(false);
        localStorage.setItem('notification-prompt-shown', 'true');
      } else {
        showInfo(t('enableNotifInSettings'));
      }
    } catch (error) {
      logError(error, { action: 'handleEnable', userId: userId ?? undefined });
      showErrorToast(t('failedNotifications'));
    }

    setLoading(false);
  }

  function handleDismiss() {
    setShow(false);
    localStorage.setItem('notification-prompt-shown', 'true');
  }

  if (!show || hideWhenOnboarding) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border-2 border-tribe-green p-4 z-50 animate-slide-up">
      <button
        onClick={handleDismiss}
        className="absolute top-1 right-1 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="p-2 bg-tribe-green rounded-lg">
          <Bell className="w-6 h-6 text-slate-900" />
        </div>

        <div className="flex-1">
          <h3 className="font-bold text-gray-900 dark:text-white mb-1">{t('stayUpdated')}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{t('notifDescription')}</p>

          <div className="flex gap-2">
            <button
              onClick={handleEnable}
              disabled={loading}
              className="flex-1 bg-tribe-green text-slate-900 font-semibold py-2 px-4 rounded-lg hover:bg-[#b0d853] transition disabled:opacity-50"
            >
              {loading ? t('enabling') : t('enable')}
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
            >
              {t('later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
