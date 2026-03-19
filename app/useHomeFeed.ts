/**
 * Hook: useHomeFeed — orchestrates sub-hooks for the home feed page.
 *
 * Composed from:
 *   - useSessionFiltering  (search, filter, date/gender/sport/distance)
 *   - useLiveStatus        (live training status per session)
 *   - useSessionActions    (join, delete, share, waiver)
 *
 * This file owns: auth check, session fetching, profile loading,
 * onboarding, and geolocation. It delegates everything else.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { getUserLocation } from '@/lib/location';
import { scheduleSessionReminders } from '@/lib/reminders';
import { fetchUpcomingSessions, fetchUserProfileMaybe } from '@/lib/dal';
import { logError } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';
import type { SessionWithRelations } from '@/lib/dal';

import { useSessionFiltering } from './hooks/useSessionFiltering';
import { useLiveStatus } from './hooks/useLiveStatus';
import { useSessionActions } from './hooks/useSessionActions';

/** Subset of user profile fields loaded on the home page */
export interface UserProfile {
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  sports: string[] | null;
  safety_waiver_accepted: boolean | null;
}

export function useHomeFeed() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();

  // --- Core state (auth, sessions, profile) ---
  const [user, setUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [sessions, setSessions] = useState<SessionWithRelations[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [fixedHeight, setFixedHeight] = useState(0);
  const [fetchError, setFetchError] = useState(false);

  // --- Composed hooks ---
  const filtering = useSessionFiltering({ sessions, userLocation });
  const liveStatus = useLiveStatus(supabase);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(false);
      const result = await fetchUpcomingSessions(supabase);
      if (!result.success) throw new Error(result.error);
      setSessions(result.data || []);
      // Defer live status loading so session list renders immediately
      requestAnimationFrame(() => {
        liveStatus.loadLiveStatuses((result.data || []).map((s) => s.id));
      });
    } catch (error) {
      logError(error, { action: 'loadSessions' });
      setFetchError(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase client is stable
  }, [supabase]);

  const actions = useSessionActions({
    supabase,
    user,
    userProfile,
    setUserProfile,
    userLocation,
    loadSessions,
  });

  // --- Effects ---
  useEffect(() => {
    checkUser();
    // Defer geolocation — not needed for initial render
    const idleId =
      typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(() => getUserLocation().then((loc) => loc && setUserLocation(loc)))
        : undefined;
    const fallbackId =
      idleId === undefined
        ? setTimeout(() => getUserLocation().then((loc) => loc && setUserLocation(loc)), 3000)
        : undefined;
    return () => {
      if (idleId !== undefined) cancelIdleCallback(idleId);
      if (fallbackId !== undefined) clearTimeout(fallbackId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userChecked) return;
    loadProfile();
    loadSessions();
    const deferredId = setTimeout(() => {
      scheduleSessionReminders();
      if (user) tryRegisterPushNotifications(user.id);
    }, 4000);
    return () => clearTimeout(deferredId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when user is set
  }, [userChecked]);

  useEffect(() => {
    if (!user || !userProfile) return;
    const isProfileComplete = userProfile.avatar_url && (userProfile.sports?.length ?? 0) > 0;
    if (isProfileComplete) {
      setShowOnboarding(false);
      return;
    }
    if (!localStorage.getItem(`hasSeenOnboarding_${user.id}`)) setShowOnboarding(true);
  }, [user, userProfile]);

  // --- Internal helpers ---
  async function tryRegisterPushNotifications(userId: string) {
    try {
      const { Capacitor } = await import('@capacitor/core');
      const isNative = Capacitor.isNativePlatform();
      if (isNative) {
        const { registerForPushNotifications } = await import('@/lib/firebase-messaging');
        await registerForPushNotifications(userId);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        const { requestNotificationPermission } = await import('@/lib/notifications');
        await requestNotificationPermission(userId);
      }
    } catch (error) {
      logError(error, { action: 'tryRegisterPushNotifications' });
    }
  }

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUser(user || null);
    setUserChecked(true);
  }

  async function loadProfile() {
    if (!user) return;
    const result = await fetchUserProfileMaybe(
      supabase,
      user.id,
      'name, avatar_url, bio, sports, safety_waiver_accepted'
    );
    setUserProfile((result.data as UserProfile | null) ?? null);
  }

  // --- Return (identical public API as before) ---
  return {
    t,
    language,
    router,
    user,
    userProfile,
    userChecked,
    sessions,
    userLocation,
    setUserLocation,
    showOnboarding,
    setShowOnboarding,
    editingSession,
    setEditingSession,
    filteredSessions: filtering.filteredSessions,
    liveNowSessions: filtering.liveNowSessions,
    loading,
    searchQuery: filtering.searchQuery,
    setSearchQuery: filtering.setSearchQuery,
    selectedSport: filtering.selectedSport,
    setSelectedSport: filtering.setSelectedSport,
    maxDistance: filtering.maxDistance,
    setMaxDistance: filtering.setMaxDistance,
    dateFilter: filtering.dateFilter,
    setDateFilter: filtering.setDateFilter,
    genderFilter: filtering.genderFilter,
    setGenderFilter: filtering.setGenderFilter,
    showSafetyWaiver: actions.showSafetyWaiver,
    setShowSafetyWaiver: actions.setShowSafetyWaiver,
    setPendingSessionId: actions.setPendingSessionId,
    liveStatusMap: liveStatus.liveStatusMap,
    liveUserIdSet: liveStatus.liveUserIdSet,
    fixedHeight,
    setFixedHeight,
    visibleCount: filtering.visibleCount,
    setVisibleCount: filtering.setVisibleCount,
    fetchError,
    confirmAction: actions.confirmAction,
    setConfirmAction: actions.setConfirmAction,
    PAGE_SIZE: filtering.PAGE_SIZE,
    loadSessions,
    handleShareSession: actions.handleShareSession,
    handleJoinSession: actions.handleJoinSession,
    handleWaiverAccepted: actions.handleWaiverAccepted,
    handleDeleteSession: actions.handleDeleteSession,
    getDistanceText: actions.getDistanceText,
  };
}
