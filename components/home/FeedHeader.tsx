'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import LanguageToggle from '@/components/LanguageToggle';
import NotificationBell from '@/components/NotificationBell';
import TribeOSQuickAccess from '@/components/TribeOSQuickAccess';
import WhatsNewBadge from '@/components/WhatsNewBadge';
import AdminQuickAccess from '@/components/AdminQuickAccess';
import TribeWordmark from '@/components/TribeWordmark';
import { translateSport } from '@/lib/translations';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-UI-FD1: the home feed's header. The app bar (wordmark, admin and Tribe.OS
 * shortcuts, what's new, notifications, language), then ONE filter row: a
 * search toggle, "Todos", the sports on the feed and "Gratis". The search
 * opens in place of the chips, so there is never a second row. Replaces
 * FilterBar's search box, four dropdowns, distance slider and barrio pills.
 */
export default function FeedHeader({
  sports,
  selectedSport,
  onSportChange,
  freeOnly,
  onFreeOnlyChange,
  searchQuery,
  onSearchChange,
  language,
  onFixedHeightChange,
}: {
  /** Sport ids present on the feed, in the order to show them. */
  sports: string[];
  selectedSport: string;
  onSportChange: (sport: string) => void;
  freeOnly: boolean;
  onFreeOnlyChange: (free: boolean) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  language: 'es' | 'en';
  onFixedHeightChange: (px: number) => void;
}) {
  const t = useTranslations('feed');
  const ref = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(!!searchQuery);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => onFixedHeightChange(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onFixedHeightChange]);

  const chip = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
      on
        ? 'border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900'
        : 'border-stone-300 bg-white text-stone-600 dark:border-tribe-mid dark:bg-tribe-card dark:text-gray-300'
    }`;

  return (
    <div ref={ref} className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark">
      <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4 md:px-6 gap-4">
        <Link href="/" className="shrink-0">
          <TribeWordmark className="h-6 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          <AdminQuickAccess />
          <TribeOSQuickAccess />
          <WhatsNewBadge />
          <NotificationBell />
          <LanguageToggle />
        </div>
      </div>
      <div className="border-t border-stone-300 dark:border-black px-4 md:px-6 py-2.5">
        <div className="max-w-2xl md:max-w-4xl mx-auto" data-testid="feed-filter-row">
          {searching ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                autoFocus
                type="search"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="w-full rounded-full border border-stone-300 bg-white py-1.5 pl-9 pr-9 text-sm text-stone-900 dark:border-tribe-mid dark:bg-tribe-card dark:text-gray-100"
              />
              <button
                type="button"
                aria-label={t('closeSearch')}
                onClick={() => {
                  onSearchChange('');
                  setSearching(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <button
                type="button"
                aria-label={t('search')}
                onClick={() => setSearching(true)}
                className="shrink-0 rounded-full border border-stone-300 bg-white p-1.5 text-stone-600 dark:border-tribe-mid dark:bg-tribe-card dark:text-gray-300"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                type="button"
                className={chip(!selectedSport && !freeOnly)}
                onClick={() => {
                  onSportChange('');
                  onFreeOnlyChange(false);
                }}
              >
                {t('all')}
              </button>
              {sports.map((sport) => (
                <button
                  key={sport}
                  type="button"
                  aria-pressed={selectedSport === sport}
                  className={chip(selectedSport === sport)}
                  onClick={() => onSportChange(selectedSport === sport ? '' : sport)}
                >
                  {translateSport(sport, language)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={freeOnly}
                className={`${chip(freeOnly)} ${freeOnly ? '' : 'border-[#CFEB88] bg-[#E9F7C7] text-[#4D7300]'}`}
                onClick={() => onFreeOnlyChange(!freeOnly)}
              >
                {t('free')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
