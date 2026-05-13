'use client';

/**
 * PwaInstallPrompt — bottom banner nudging users to install the PWA
 * to their home screen. Shows on Tribe.OS + /my-coach surfaces.
 *
 * Why this matters: installed PWA users return ~5× more than
 * browser-only users. The browser bar steals real estate, the icon
 * lives on the home screen alongside other "real apps," and
 * notifications work properly. Single highest-leverage retention
 * lever for a webapp that doesn't already have an app-store presence
 * everywhere.
 *
 * How the prompt actually works:
 *   - Chrome / Edge / Brave / Opera (Android + desktop): fires the
 *     `beforeinstallprompt` event when install is available. We
 *     intercept that event, stash it, and call .prompt() when the
 *     user clicks our CTA. The browser shows its own native dialog.
 *   - iOS Safari: doesn't support beforeinstallprompt. We don't show
 *     anything here — the existing IOSInstallPrompt component already
 *     surfaces "Add to Home Screen" instructions for iOS users.
 *   - Capacitor / native wrapper: skip entirely (they're already in
 *     an app).
 *
 * Dismiss is localStorage-gated for 30 days. Once installed, the
 * standalone display mode kicks in and the banner self-hides.
 */

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'tribe_pwa_install_dismissed_at';
const DISMISS_DAYS = 30;

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Install Tribe',
    body: 'Add it to your home screen for faster access and reliable notifications.',
    install: 'Install',
    dismiss: 'Not now',
  },
  es: {
    title: 'Instala Tribe',
    body: 'Agrégala a tu pantalla principal para acceso más rápido y notificaciones confiables.',
    install: 'Instalar',
    dismiss: 'Ahora no',
  },
} as const;

export default function PwaInstallPrompt() {
  const { language } = useLanguage();
  const s = copy[language];
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Skip if already installed (display-mode: standalone) — the
    // browser fires this query true once the user has added the PWA
    // to their home screen, regardless of platform.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Skip when running inside the native Capacitor wrapper —
    // there's nothing to "install" since we're already in an app.
    const isNative =
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ===
      true;
    if (isNative) return;

    // Skip when recently dismissed.
    try {
      const dismissedAt = window.localStorage.getItem(DISMISS_KEY);
      if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
    } catch {
      // localStorage can throw in private mode; we'll just show the
      // banner once per session in that case.
    }

    function onBeforeInstall(e: Event) {
      // Prevent the browser from showing its own automatic mini-banner.
      // We want to render our own contextually-styled prompt instead.
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      // Brief delay so the banner doesn't slide in on top of the
      // initial page paint.
      setTimeout(() => setShow(true), 1500);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  async function handleInstall() {
    if (!event) return;
    trackEvent('tribe_pwa_install_prompt_clicked');
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        trackEvent('tribe_pwa_installed');
      } else {
        // User chose "Not now" in the browser's native dialog —
        // honor that by hiding our prompt for the dismissal window.
        markDismissed();
      }
    } catch {
      // If .prompt() throws (browsers can reject after first use),
      // dismiss quietly and stay out of the way.
      markDismissed();
    }
    setShow(false);
    setEvent(null);
  }

  function handleDismiss() {
    trackEvent('tribe_pwa_install_prompt_dismissed');
    markDismissed();
    setShow(false);
  }

  function markDismissed() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Ignore — the in-memory dismissal still works for this session.
    }
  }

  if (!show || !event) return null;

  return (
    <div
      // Slide in from the bottom on mobile, bottom-right on wider
      // screens. z-50 keeps it above page chrome but below modals.
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 bg-white border border-gray-200 rounded-2xl shadow-xl p-4 animate-slide-up"
      role="dialog"
      aria-label={s.title}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={s.dismiss}
        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="w-10 h-10 rounded-xl bg-tribe-green/15 text-tribe-green-dark flex items-center justify-center shrink-0">
          <Download className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">{s.title}</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{s.body}</p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full hover:shadow-tribe transition-shadow"
            >
              <Download className="w-3.5 h-3.5" />
              {s.install}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2 py-1"
            >
              {s.dismiss}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
