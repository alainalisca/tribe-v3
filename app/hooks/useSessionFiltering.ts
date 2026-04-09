/** Hook: useSessionFiltering — filter/search logic for the session feed */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { calculateDistance } from '@/lib/distance';
import type { SessionWithRelations } from '@/lib/dal';

const PAGE_SIZE = 20;

interface FilterState {
  searchQuery: string;
  selectedSport: string;
  maxDistance: number;
  dateFilter: string;
  genderFilter: string;
  pricingFilter: string; // 'all' | 'free' | 'paid'
}

interface UseSessionFilteringArgs {
  sessions: SessionWithRelations[];
  userLocation: { latitude: number; longitude: number } | null;
}

export function useSessionFiltering({ sessions, userLocation }: UseSessionFilteringArgs) {
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedSport: '',
    maxDistance: 100,
    dateFilter: 'all',
    genderFilter: 'all',
    pricingFilter: 'all',
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters]);

  const liveNowSessions = useMemo(() => {
    const now = new Date();
    return sessions.filter((s) => {
      if (!s.is_training_now) return false;
      const sessionStart = new Date(`${s.date}T${s.start_time}`);
      const sessionEnd = new Date(sessionStart.getTime() + (s.duration || 60) * 60000);
      return sessionStart <= new Date(now.getTime() + 120 * 60000) && sessionEnd > now;
    });
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    let filtered = [...sessions];

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.sport?.toLowerCase().includes(query) ||
          s.location?.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query)
      );
    }
    if (filters.selectedSport) {
      filtered = filtered.filter((s) => s.sport === filters.selectedSport);
    }
    if (userLocation && filters.maxDistance < 100) {
      filtered = filtered.filter((s) => {
        if (!s.latitude || !s.longitude) return true;
        return (
          calculateDistance(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude) <=
          filters.maxDistance
        );
      });
    }
    if (filters.dateFilter !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date();
      if (filters.dateFilter === 'today') endDate.setHours(23, 59, 59, 999);
      else if (filters.dateFilter === 'week') endDate.setDate(today.getDate() + 7);
      else if (filters.dateFilter === 'month') endDate.setMonth(today.getMonth() + 1);
      filtered = filtered.filter((s) => {
        const sessionDate = new Date(s.date + 'T00:00:00');
        return sessionDate >= today && sessionDate <= endDate;
      });
    }
    if (filters.genderFilter !== 'all') {
      filtered = filtered.filter(
        (s) => s.gender_preference === filters.genderFilter || s.gender_preference === 'all' || !s.gender_preference
      );
    }
    if (filters.pricingFilter !== 'all') {
      filtered = filtered.filter((s) =>
        filters.pricingFilter === 'paid' ? s.is_paid === true : !s.is_paid
      );
    }
    return filtered;
  }, [sessions, filters, userLocation]);

  const setSearchQuery = useCallback((v: string) => setFilters((f) => ({ ...f, searchQuery: v })), []);
  const setSelectedSport = useCallback((v: string) => setFilters((f) => ({ ...f, selectedSport: v })), []);
  const setMaxDistance = useCallback((v: number) => setFilters((f) => ({ ...f, maxDistance: v })), []);
  const setDateFilter = useCallback((v: string) => setFilters((f) => ({ ...f, dateFilter: v })), []);
  const setGenderFilter = useCallback((v: string) => setFilters((f) => ({ ...f, genderFilter: v })), []);
  const setPricingFilter = useCallback((v: string) => setFilters((f) => ({ ...f, pricingFilter: v })), []);

  return {
    filteredSessions,
    liveNowSessions,
    searchQuery: filters.searchQuery,
    setSearchQuery,
    selectedSport: filters.selectedSport,
    setSelectedSport,
    maxDistance: filters.maxDistance,
    setMaxDistance,
    dateFilter: filters.dateFilter,
    setDateFilter,
    genderFilter: filters.genderFilter,
    setGenderFilter,
    pricingFilter: filters.pricingFilter,
    setPricingFilter,
    visibleCount,
    setVisibleCount,
    PAGE_SIZE,
  };
}
