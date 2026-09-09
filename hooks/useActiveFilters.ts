'use client';

import { useMemo } from 'react';
import type { ActiveFilter } from '@/components/home/ActiveFilterRow';
import { getPopularNeighborhoods } from '@/lib/city-config';
import { sportTranslations } from '@/lib/translations';
import type { TranslationKey } from '@/lib/translations';

interface UseActiveFiltersInput {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedSport: string;
  setSelectedSport: (s: string) => void;
  dateFilter: string;
  setDateFilter: (d: string) => void;
  genderFilter: string;
  setGenderFilter: (g: string) => void;
  pricingFilter: string;
  setPricingFilter: (p: string) => void;
  selectedNeighborhood?: string | null;
  onNeighborhoodChange?: (id: string | null) => void;
  language: 'en' | 'es';
  t: (key: TranslationKey) => string;
  tr: (key: string) => string;
}

/**
 * The filters currently narrowing the feed, as removable chip descriptors.
 *
 * Lives outside FilterBar so that file stays under the 300-line rule, and so
 * the collapsed row's contents are testable without rendering the header.
 */
export function useActiveFilters({
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
}: UseActiveFiltersInput): ActiveFilter[] {
  return useMemo<ActiveFilter[]>(() => {
    const list: ActiveFilter[] = [];

    if (searchQuery) list.push({ id: 'search', label: searchQuery, clear: () => setSearchQuery('') });

    if (selectedSport) {
      list.push({
        id: 'sport',
        label: language === 'es' ? sportTranslations[selectedSport]?.es || selectedSport : selectedSport,
        clear: () => setSelectedSport(''),
      });
    }

    if (dateFilter !== 'all') {
      list.push({ id: 'date', label: t(dateFilter as TranslationKey), clear: () => setDateFilter('all') });
    }

    if (genderFilter !== 'all') {
      list.push({
        id: 'gender',
        label: genderFilter === 'women_only' ? t('women') : t('men'),
        clear: () => setGenderFilter('all'),
      });
    }

    if (pricingFilter !== 'all') {
      list.push({
        id: 'pricing',
        label: pricingFilter === 'free' ? tr('filterFree') : tr('filterPaid'),
        clear: () => setPricingFilter('all'),
      });
    }

    if (selectedNeighborhood) {
      const hood = getPopularNeighborhoods().find((h) => h.id === selectedNeighborhood);
      if (hood) list.push({ id: 'hood', label: hood.name, clear: () => onNeighborhoodChange?.(null) });
    }

    return list;
  }, [
    searchQuery,
    selectedSport,
    dateFilter,
    genderFilter,
    pricingFilter,
    selectedNeighborhood,
    language,
    t,
    tr,
    setSearchQuery,
    setSelectedSport,
    setDateFilter,
    setGenderFilter,
    setPricingFilter,
    onNeighborhoodChange,
  ]);
}
