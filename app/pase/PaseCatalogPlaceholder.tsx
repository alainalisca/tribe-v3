'use client';

import { useLanguage } from '@/lib/LanguageContext';

/**
 * T-AV0, Step 6. The placeholder body of the gated pass catalog.
 *
 * It exists so acceptance check 5 has something real to assert on: with the
 * flag on for an allowlisted user this renders, and with the flag off the page
 * above it is a 404. It deliberately shows no data -- reading pass data is a
 * later T-AV ticket, and a placeholder that queries is a placeholder that can
 * break.
 *
 * Client component only because `useLanguage` is a context hook. The DECISION
 * is made by the server component that renders this; nothing here decides
 * anything, so there is no gate a browser could edit.
 */
export default function PaseCatalogPlaceholder() {
  const { t } = useLanguage();

  return (
    <main className="mx-auto max-w-2xl px-4 pt-header pb-nav">
      <span className="inline-block rounded-full bg-tribe-green px-3 py-1 text-xs font-semibold text-tribe-dark">
        {t('avPreviewBadge')}
      </span>
      <h1 className="mt-4 text-2xl font-bold text-tribe-dark dark:text-white">{t('avPaseCatalogTitle')}</h1>
      <p className="mt-2 text-tribe-gray-600 dark:text-tribe-gray-300">{t('avPaseCatalogLead')}</p>
      <p className="mt-8 text-sm text-tribe-gray-500 dark:text-tribe-gray-400">{t('avPaseCatalogEmpty')}</p>
    </main>
  );
}
