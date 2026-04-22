'use client';

/**
 * Root route-group error boundary.
 *
 * Catches uncaught errors in pages/components under app/* (except the
 * root layout — see global-error.tsx for that).
 *
 * LR-01 (PostHog, revised 2026-04-21): React render errors are NOT
 * caught by window.onerror, so `capture_exceptions: true` in
 * lib/posthog.ts doesn't pick them up. Each error boundary has to
 * explicitly call posthog.captureException. Doing it in useEffect
 * (not during render) avoids re-entering the error boundary if
 * captureException itself throws.
 */

import { useEffect } from 'react';
import { logError } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';
import { getPostHog } from '@/lib/posthog';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLanguage();

  useEffect(() => {
    // Console + structured log (goes to Vercel Logs).
    logError(error, { action: 'error_boundary', route: 'app/error', digest: error.digest });

    // Explicit PostHog capture for React render errors. The global
    // `capture_exceptions: true` option catches window.onerror +
    // unhandledrejection, but NOT errors thrown inside React render.
    try {
      const ph = getPostHog();
      ph?.captureException(error, {
        error_digest: error.digest,
        source: 'react_error_boundary',
        route: 'app/error',
      });
    } catch {
      // Never throw from an error boundary.
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-tribe-mid p-4">
      <div className="text-center">
        <div className="text-5xl mb-4">😵</div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">{t('somethingWentWrong')}</h2>
        <p className="text-stone-600 dark:text-stone-300 mb-6">{t('dontWorryDataSafe')}</p>
        <Button onClick={reset} className="font-semibold rounded-xl">
          {t('tryAgain')}
        </Button>
      </div>
    </div>
  );
}
