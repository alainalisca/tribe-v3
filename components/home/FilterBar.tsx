'use client';

import { useRef, useEffect, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import LanguageToggle from '@/components/LanguageToggle';
import NotificationBell from '@/components/NotificationBell';
import { sportTranslations, TranslationKey } from '@/lib/translations';
import { getPopularNeighborhoods, detectNeighborhood } from '@/lib/city-config';

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
  const sports = Object.keys(sportTranslations);

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
      <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
        <Link href="/profile">
          <h1 className="text-xl font-bold text-stone-900 dark:text-white cursor-pointer">
            Tribe<span className="text-tribe-green">.</span>
          </h1>
        </Link>
        <div className="flex items-center gap-3">
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

          <div className="grid grid-cols-4 gap-2">
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
            >
              <option value="">{t('sport')}</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>
                  {language === 'es' ? sportTranslations[sport]?.es || sport : sport}
                </option>
              ))}
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
            >
              <option value="all">{t('date')}</option>
              <option value="today">{t('today')}</option>
              <option value="week">{t('week')}</option>
              <option value="month">{t('month')}</option>
            </select>

            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
            >
              <option value="all">{t('all')}</option>
              <option value="women_only">{t('women')}</option>
              <option value="men_only">{t('men')}</option>
            </select>

            <select
              value={pricingFilter}
              onChange={(e) => setPricingFilter(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
            >
              <option value="all">{language === 'es' ? 'Todos' : 'All'}</option>
              <option value="free">{language === 'es' ? 'Gratis' : 'Free'}</option>
              <option value="paid">{language === 'es' ? 'De pago' : 'Paid'}</option>
            </select>
          </div>

          {userLocation && (
            <div className="flex items-center gap-3 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg px-3 py-1.5">
              <label className="text-xs font-medium text-stone-900 dark:text-gray-100 whitespace-nowrap">
                {t('dist')}
              </label>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))}
                className="flex-1 h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-tribe-green"
              />
              <span className="text-xs font-semibold text-tribe-green min-w-[48px] text-right flex-shrink-0">
                {maxDistance === 100 ? t('all') : `${maxDistance}km`}
              </span>
            </div>
          )}

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
    </div>
  );
}
