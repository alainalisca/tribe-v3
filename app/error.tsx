'use client';

import { logError } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  logError(error, { action: 'error_boundary', route: 'app/error' });
  const { t } = useLanguage();

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
