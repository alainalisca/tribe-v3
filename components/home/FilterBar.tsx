'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Search, X, MessageCircle, Film } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import LanguageToggle from '@/components/LanguageToggle';
import { sportTranslations, TranslationKey } from '@/lib/translations';

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedSport: string;
  setSelectedSport: (sport: string) => void;
  dateFilter: string;
  setDateFilter: (filter: string) => void;
  genderFilter: string;
  setGenderFilter: (filter: string) => void;
  maxDistance: number;
  setMaxDistance: (distance: number) => void;
  userLocation: { latitude: number; longitude: number } | null;
  loading: boolean;
  filteredCount: number;
  language: 'en' | 'es';
  t: (key: TranslationKey) => string;
  onFixedHeightChange: (height: number) => void;
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
  maxDistance,
  setMaxDistance,
  userLocation,
  loading,
  filteredCount,
  language,
  t,
  onFixedHeightChange,
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
  }, [userLocation, loading, searchQuery, selectedSport, filteredCount, measureFixed]);

  return (
    <div ref={fixedAreaRef} className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34]">
      <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
        <Link href="/profile">
          <h1 className="text-xl font-bold text-stone-900 dark:text-white cursor-pointer">
            Tribe<span className="text-tribe-green">.</span>
          </h1>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/stories" className="text-stone-700 dark:text-gray-300 hover:text-tribe-green transition-colors">
            <Film className="w-6 h-6" />
          </Link>
          <Link href="/messages" className="text-stone-700 dark:text-gray-300 hover:text-tribe-green transition-colors">
            <MessageCircle className="w-6 h-6" />
          </Link>
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
              className="pl-10 pr-10 py-2.5 bg-white dark:bg-[#6B7178] dark:border-[#52575D] text-stone-900 dark:text-gray-100 placeholder-gray-500 focus:ring-tribe-green text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-stone-900 dark:hover:text-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
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
              className="w-full p-2.5 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
            >
              <option value="all">{t('date')}</option>
              <option value="today">{t('today')}</option>
              <option value="week">{t('week')}</option>
              <option value="month">{t('month')}</option>
            </select>

            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green text-sm"
            >
              <option value="all">👥 {t('all')}</option>
              <option value="women_only">👩 {t('women')}</option>
              <option value="men_only">👨 {t('men')}</option>
            </select>
          </div>

          {userLocation && (
            <div className="flex items-center gap-3 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg px-3 py-1.5">
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

          {(!loading || searchQuery || selectedSport) && (
            <div className="flex items-center justify-between">
              {!loading && (
                <p className="text-xs text-stone-600 dark:text-gray-300">
                  {filteredCount} {t('sessionsCount')}
                </p>
              )}
              {(searchQuery || selectedSport || dateFilter !== 'all' || genderFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSport('');
                    setDateFilter('all');
                    setGenderFilter('all');
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
