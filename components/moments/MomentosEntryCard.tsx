'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, GalleryHorizontalEnd } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-MOM1 Part C: the way into Momentos from the person's own profile. Only on
 * their own profile (the page it sits on is /profile, never another person's)
 * and only while Moments is on (/api/moments/status/ answers).
 */
export default function MomentosEntryCard() {
  const t = useTranslations('moments');
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    fetch('/api/moments/status/')
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { enabled?: boolean } | null) => live && setEnabled(!!b?.enabled))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!enabled) return null;
  return (
    <Link
      href="/profile/momentos/"
      data-testid="momentos-entry"
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-tribe-mid bg-white px-5 py-4 text-left transition hover:border-tribe-green dark:bg-tribe-surface"
    >
      <GalleryHorizontalEnd className="h-6 w-6 flex-shrink-0 text-tribe-gray-60" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-stone-900 dark:text-white">{t('momentosTitle')}</span>
        <span className="block text-xs text-muted-foreground">{t('momentosRowHint')}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-tribe-gray-60" />
    </Link>
  );
}
