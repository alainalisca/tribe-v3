'use client';

import { useState, useEffect } from 'react';
import { logError } from '@/lib/logger';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/LanguageContext';

const APP_STORE_URL = 'https://apps.apple.com/us/app/tribe-never-train-alone/id6458219258';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=prod.tribe.android';
const DISMISS_KEY = 'appStoreBannerDismissedAt';
const DISMISS_DAYS = 7;

export default function AppStoreBanner() {
  const { t } = useLanguage();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const android = /Android/.test(navigator.userAgent);
      const isInStandaloneMode = 'standalone' in window.navigator && window.navigator.standalone;

      // Check if running in Capacitor native app
      const isNativePlatform =
        (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ===
        true;

      // Check if dismissed within the last 7 days
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      const isDismissed = dismissedAt ? Date.now() - Number(dismissedAt) < DISMISS_DAYS * 24 * 60 * 60 * 1000 : false;

      // Only show if: mobile browser, not installed/native, and not recently dismissed
      if ((iOS || android) && !isInStandaloneMode && !isNativePlatform && !isDismissed) {
        const timer = setTimeout(() => setShow(true), 3000);
        return () => clearTimeout(timer);
      }
    } catch (error) {
      logError(error, { action: 'AppStoreBanner.init' });
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (error) {
      logError(error, { action: 'AppStoreBanner.dismiss' });
    }
  };

  if (!show) return null;

  return (
    <Dialog open={show} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent data-modal="true" className="max-w-md rounded-2xl p-6 dark:bg-[#2C3137]">
        <DialogTitle className="sr-only">{t('getTheTribeApp')}</DialogTitle>

        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-tribe-dark rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-white">
              Tribe<span className="text-tribe-green">.</span>
            </span>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-stone-900 dark:text-white">{t('getTheTribeApp')}</h2>
          <p className="text-gray-600 dark:text-gray-400">{t('availableOnIOSAndAndroid')}</p>
        </div>

        <div className="flex gap-3 mb-4">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-black text-white font-semibold rounded-lg hover:bg-gray-900 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-tribe-green text-white font-semibold rounded-lg hover:opacity-90 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302c.504.293.504 1.025 0 1.318l-2.302 1.372-2.533-2.533 2.533-2.46zM5.864 2.658L16.8 8.99l-2.302 2.302-8.635-8.635z" />
            </svg>
            Google Play
          </a>
        </div>

        <button
          onClick={handleDismiss}
          className="w-full py-3 text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {t('continueInBrowser')}
        </button>
      </DialogContent>
    </Dialog>
  );
}
