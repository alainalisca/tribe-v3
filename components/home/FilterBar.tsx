'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { MapPin, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import LanguageToggle from '@/components/LanguageToggle';
import NotificationBell from '@/components/NotificationBell';
import TribeOSQuickAccess from '@/components/TribeOSQuickAccess';
import AdminQuickAccess from '@/components/AdminQuickAccess';
import WhatsNewBadge from '@/components/WhatsNewBadge';
import type { TranslationKey } from '@/lib/translations';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { getPopularNeighborhoods, detectNeighborhood } from '@/lib/city-config';
import { useCollapseOnScroll } from '@/hooks/useCollapseOnScroll';
import ActiveFilterRow from '@/components/home/ActiveFilterRow';
import { useActiveFilters } from '@/hooks/useActiveFilters';
import FilterSelects from '@/components/home/FilterSelects';
import DistanceSlider from '@/components/home/DistanceSlider';

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

  const measureFixed = useCallback(() => {
    if (fixedAreaRef.current) {
      onFixedHeightChange(fixedAreaRef.current.offsetHeight);
    }
  }, [onFixedHeightChange]);

  // A ResizeObserver rather than a hand-maintained dependency list. The old
  // list missed any height change that did not come with one of its named
  // props or a window resize: measured live, the header reported 335px while
  // the element was 319px, so the feed's top padding sat 16px off until an
  // unrelated resize corrected it. The observer cannot miss a case, and it
  // covers the collapse/expand transition for free.
  useEffect(() => {
    const element = fixedAreaRef.current;
    if (!element) return;

    measureFixed();
    window.addEventListener('resize', measureFixed);

    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', measureFixed);
    }
    const observer = new ResizeObserver(() => measureFixed());
    observer.observe(element);
    return () => {
      window.removeEventListener('resize', measureFixed);
      observer.disconnect();
    };
  }, [measureFixed]);

  // Collapse the controls on scroll down, restore them on scroll up. The
  // athlete can always force them open from the Filters button.
  const autoCollapsed = useCollapseOnScroll();
  const [forcedOpen, setForcedOpen] = useState(false);
  const collapsed = autoCollapsed && !forcedOpen;

  // Re-collapsing is the scroll's job; once the athlete scrolls up and the
  // controls come back on their own, drop the override.
  useEffect(() => {
    if (!autoCollapsed) setForcedOpen(false);
  }, [autoCollapsed]);

  const activeFilters = useActiveFilters({
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
    selectedNeighborhood,
    onNeighborhoodChange,
    language,
    t,
    tr,
  });

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
      <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4 md:px-6 gap-4">
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

      <div className="border-t border-stone-300 dark:border-black p-4 md:px-6 pb-3">
        <div className="max-w-2xl md:max-w-4xl mx-auto space-y-2">
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

          {/* Collapsible region. Height animates to 0 on scroll down so the
              feed gains back most of the 319px this header occupies on a
              375x667 phone. Search and the wordmark stay pinned. */}
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
              collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
            }`}
            aria-hidden={collapsed}
          >
            <div className="overflow-hidden min-h-0 space-y-2">
              <FilterSelects
                selectedSport={selectedSport}
                setSelectedSport={setSelectedSport}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                genderFilter={genderFilter}
                setGenderFilter={setGenderFilter}
                pricingFilter={pricingFilter}
                setPricingFilter={setPricingFilter}
                language={language}
                t={t}
              />

              {userLocation && <DistanceSlider maxDistance={maxDistance} setMaxDistance={setMaxDistance} t={t} />}

              {/* Neighborhood pills */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                <MapPin className="w-4 h-4 text-theme-tertiary self-center flex-shrink-0" aria-hidden="true" />
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
                        ? 'bg-tribe-green text-slate-900 border-tribe-green'
                        : 'bg-theme-card text-theme-secondary border-theme'
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

          {collapsed && <ActiveFilterRow filters={activeFilters} onExpand={() => setForcedOpen(true)} />}
        </div>
      </div>
    </div>
  );
}
