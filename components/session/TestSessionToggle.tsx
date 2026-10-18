'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-JOIN1b: "Sesión de prueba". On create and edit, for any host (admins
 * included). Off by default. On, the session is hidden from the feed,
 * search, the site, coach pages, the sitemap and share cards, and only its
 * host and the admins can open it (sessions.is_test, migration 222).
 */
export default function TestSessionToggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const t = useTranslations('sessionTest');
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-theme bg-theme-card p-4">
      <div className="min-w-0">
        <p id="test-session-label" className="text-base font-semibold text-theme-primary">
          {t('label')}
        </p>
        <p className="mt-1 text-xs text-theme-secondary">{t('hint')}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby="test-session-label"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tribe-green ${value ? 'bg-tribe-green' : 'bg-stone-400'}`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white dark:bg-tribe-green shadow-lg transform transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}
