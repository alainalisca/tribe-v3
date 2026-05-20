'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { trackEvent } from '@/lib/analytics';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import LanguageToggle from '@/components/LanguageToggle';
import NotificationBell from '@/components/NotificationBell';
import TribeOSQuickAccess from '@/components/TribeOSQuickAccess';
import AdminQuickAccess from '@/components/AdminQuickAccess';
import WhatsNewBadge from '@/components/WhatsNewBadge';
import { sportTranslations, TranslationKey } from '@/lib/translations';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { getPopularNeighborhoods, detectNeighborhood } from '@/lib/city-config';

import TribeWordmark from '@/components/TribeWordmark';
interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedSport: string;
  setSelectedSport: (sport: string) => void;
  dateFilter: string;
  setDateFilter: (filter: string) => void;
  genderFilter: string;
  setGenderFilter: (filter: string) => void;
  pricingFilter: string;
  setPricingFilter: (filter: string) => void;
  maxDistance: number;
  setMaxDistance: (distance: number) => void;
  userLocation: { latitude: number; longitude: number } | null;
  loading: boolean;
  filteredCount: number;
  language: 'en' | 'es';
  t: (key: TranslationKey) => string;
  onFixedHeightChange: (height: number) => void;
  selectedNeighborhood?: string | null;
  onNeighborhoodChange?: (id: string | null) => void;
}

export default function FilterBar({
  searchQuery,
  setSearchQuery,
  selectedSport,
  setSelectedSport,
  dateFilter,
  setDateFilter,
  genderFilter,
  setGenderFilter,
  pricingFilter,
  setPricingFilter,
  maxDistance,
  setMaxDistance,
  userLocation,
  loading,
  filteredCount,
  language,
  t,
  onFixedHeightChange,
  selectedNeighborhood,
  onNeighborhoodChange,
}: FilterBarProps) {
  const fixedAreaRef = useRef<HTMLDivElement>(null);
  const tr = useTranslations('home');
  const sports = Object.keys(sportTranslations);
  // Filter sheet is closed by default — opens when the user taps the
  // Filters button. Lifts 4 selects + distance slider off the first paint
  // so a new user sees session cards before they see a wall of dropdowns.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Count how many filters are non-default so we can show a badge.
  const activeFilterCount =
    (selectedSport ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (genderFilter !== 'all' ? 1 : 0) +
    (pricingFilter !== 'all' ? 1 : 0) +
    (userLocation && maxDistance < 100 ? 1 : 0);

  const measureFixed = useCallback(() => {
    if (fixedAreaRef.current) {
      onFixedHeightChange(fixedAreaRef.current.offsetHeight);
    }
  }, [onFixedHeightChange]);

  useEffect(() => {
    measureFixed();
    window.addEventListener('resize', measureFixed);
    return () => window.removeEventListener('resize', measureFixed);
  }, [measureFixed]);

  // Re-measure when content changes
  useEffect(() => {
    measureFixed();
    requestAnimationFrame(() => measureFixed());
  }, [userLocation, loading, searchQuery, selectedSport, filteredCount, selectedNeighborhood, measureFixed]);

  // Track search execution (debounced — only fires after user stops typing)
  useEffect(() => {
    if (!searchQuery) return;
    const timer = setTimeout(() => {
      trackEvent('search_executed', {
        query: searchQuery,
        result_count: filteredCount,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [searchQuery, filteredCount]);

  // Auto-detect neighborhood on mount when location first appears
  useEffect(() => {
    if (userLocation && onNeighborhoodChange) {
      const detected = detectNeighborhood(userLocation.latitude, userLocation.longitude);
      if (detected) {
        onNeighborhoodChange(detected.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only auto-detect once when location first appears
  }, [userLocation]);

  return (
    <div ref={fixedAreaRef} className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark">
      <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4 gap-4">
        <Link href="/profile" className="shrink-0">
          {/* Slightly larger so the wordmark dominates and the notification
              badge can't visually mash into the green dot. */}
          <TribeWordmark className="h-6 w-auto" />
        </Link>
        <div className="flex items-center gap-2">
          {/* Premium-only shortcut to /os/dashboard. Renders nothing
              for non-premium users so the header stays clean for the
              consumer app's main audience. Admin shortcut sits next
              to it, also conditionally rendered. */}
          <AdminQuickAccess />
          <TribeOSQuickAccess />
          <WhatsNewBadge />
          <NotificationBell />
          <LanguageToggle />
        </div>
      </div>

      <div className="border-t border-stone-300 dark:border-black p-4 pb-3">
        <div className="max-w-2xl mx-auto space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
              className="pl-10 pr-10 py-2.5 bg-white dark:bg-tribe-card dark:border-tribe-mid text-stone-900 dark:text-gray-100 placeholder-gray-500 focus:ring-tribe-green text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-stone-900 dark:hover:text-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Single Filters button + neighborhood pills. The 4 selects
              (sport/date/gender/pricing) + distance slider now live in
              the bottom-sheet below. New users see session cards instead
              of a wall of dropdowns. */}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 p-2.5 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg text-stone-900 dark:text-gray-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-tribe-mid transition"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>{language === 'es' ? 'Filtros' : 'Filters'}</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-tribe-green text-slate-900 text-xs font-bold rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Neighborhood pills */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <div className="w-px h-6 bg-stone-300 dark:bg-tribe-mid self-center mx-1 flex-shrink-0" />
            {getPopularNeighborhoods().map((hood) => (
              <button
                key={hood.id}
                onClick={() => {
                  const newValue = selectedNeighborhood === hood.id ? null : hood.id;
                  if (newValue) {
                    trackEvent('neighborhood_selected', {
                      neighborhood: hood.name,
                      source: 'filter_pill',
                    });
                  }
                  onNeighborhoodChange?.(newValue);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all flex-shrink-0 ${
                  selectedNeighborhood === hood.id
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30'
                }`}
              >
                {hood.name}
              </button>
            ))}
          </div>

          {(!loading || searchQuery || selectedSport) && (
            <div className="flex items-center justify-between">
              {!loading && (
                <p className="text-xs text-stone-600 dark:text-gray-300">
                  {filteredCount} {t('sessionsCount')}
                </p>
              )}
              {(searchQuery ||
                selectedSport ||
                dateFilter !== 'all' ||
                genderFilter !== 'all' ||
                pricingFilter !== 'all' ||
                selectedNeighborhood) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSport('');
                    setDateFilter('all');
                    setGenderFilter('all');
                    setPricingFilter('all');
                    onNeighborhoodChange?.(null);
                  }}
                  className="text-xs text-tribe-green hover:underline"
                >
                  {t('clearAll')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filters bottom-sheet. Portal so it sits above BottomNav (z-50). */}
      {filtersOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setFiltersOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filters-sheet-title"
          >
            <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-theme-card rounded-t-2xl sm:rounded-2xl shadow-xl px-6 py-4 max-h-[80vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
            >
              <div className="flex justify-center -mt-1 mb-3">
                <div className="w-10 h-1 rounded-full bg-stone-300 dark:bg-tribe-mid" aria-hidden="true" />
              </div>

              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 id="filters-sheet-title" className="text-lg font-bold text-theme-primary">
                  {language === 'es' ? 'Filtros' : 'Filters'}
                </h2>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label={language === 'es' ? 'Cerrar' : 'Close'}
                  className="p-1 -m-1 rounded-full text-theme-secondary hover:text-theme-primary transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <label className="block">
                  <span className="block text-xs font-semibold text-theme-secondary mb-1.5 uppercase tracking-wide">
                    {t('sport')}
                  </span>
                  <select
                    value={selectedSport}
                    onChange={(e) => setSelectedSport(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 dark:bg-tribe-mid border border-stone-200 dark:border-tribe-card rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
                  >
                    <option value="">{language === 'es' ? 'Todos' : 'All'}</option>
                    {sports.map((sport) => (
                      <option key={sport} value={sport}>
                        {language === 'es' ? sportTranslations[sport]?.es || sport : sport}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold text-theme-secondary mb-1.5 uppercase tracking-wide">
                    {t('date')}
                  </span>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 dark:bg-tribe-mid border border-stone-200 dark:border-tribe-card rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
                  >
                    <option value="all">{language === 'es' ? 'Todas las fechas' : 'Any date'}</option>
                    <option value="today">{t('today')}</option>
                    <option value="week">{t('week')}</option>
                    <option value="month">{t('month')}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold text-theme-secondary mb-1.5 uppercase tracking-wide">
                    {language === 'es' ? 'Género' : 'Gender'}
                  </span>
                  <select
                    value={genderFilter}
                    onChange={(e) => setGenderFilter(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 dark:bg-tribe-mid border border-stone-200 dark:border-tribe-card rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
                  >
                    <option value="all">{t('all')}</option>
                    <option value="women_only">{t('women')}</option>
                    <option value="men_only">{t('men')}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-xs font-semibold text-theme-secondary mb-1.5 uppercase tracking-wide">
                    {language === 'es' ? 'Precio' : 'Price'}
                  </span>
                  <select
                    value={pricingFilter}
                    onChange={(e) => setPricingFilter(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 dark:bg-tribe-mid border border-stone-200 dark:border-tribe-card rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
                  >
                    <option value="all">{tr('filterAll')}</option>
                    <option value="free">{tr('filterFree')}</option>
                    <option value="paid">{tr('filterPaid')}</option>
                  </select>
                </label>

                {userLocation && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-theme-secondary uppercase tracking-wide">
                        {language === 'es' ? 'Distancia' : 'Distance'}
                      </span>
                      <span className="text-xs font-semibold text-tribe-green">
                        {maxDistance === 100 ? t('all') : `${maxDistance} km`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="5"
                      value={maxDistance}
                      onChange={(e) => setMaxDistance(Number(e.target.value))}
                      className="w-full h-1.5 bg-stone-200 dark:bg-tribe-mid rounded-lg appearance-none cursor-pointer accent-tribe-green"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSport('');
                    setDateFilter('all');
                    setGenderFilter('all');
                    setPricingFilter('all');
                    setMaxDistance(100);
                  }}
                  className="flex-1 py-3 rounded-xl border border-stone-300 dark:border-tribe-mid text-theme-primary font-semibold hover:bg-stone-50 dark:hover:bg-tribe-mid transition"
                >
                  {language === 'es' ? 'Limpiar' : 'Clear'}
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-tribe-green text-slate-900 font-bold hover:bg-lime-500 transition"
                >
                  {language === 'es' ? `Ver ${filteredCount}` : `Show ${filteredCount}`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
