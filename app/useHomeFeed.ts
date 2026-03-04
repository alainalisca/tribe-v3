/** Hook: useHomeFeed — all state, effects, and handlers for home feed page */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { getUserLocation } from '@/lib/location';
import { scheduleSessionReminders } from '@/lib/reminders';
import { calculateDistance, formatDistance } from '@/lib/distance';
import { registerForPushNotifications } from '@/lib/firebase-messaging';
import { joinSession } from '@/lib/sessions';
import { getErrorMessage } from '@/lib/errorMessages';
import { fetchUpcomingSessions, deleteSession as dalDeleteSession } from '@/lib/dal';
import { logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import type { User } from '@supabase/supabase-js';
import type { SessionWithRelations } from '@/lib/dal';

/** Subset of user profile fields loaded on the home page */
export interface UserProfile {
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  sports: string[] | null;
  safety_waiver_accepted: boolean | null;
}

const PAGE_SIZE = 20;

export function useHomeFeed() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();

  const [user, setUser] = useState<User | null>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [sessions, setSessions] = useState<SessionWithRelations[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionWithRelations | null>(null);
  const [filteredSessions, setFilteredSessions] = useState<SessionWithRelations[]>([]);
  const [liveNowSessions, setLiveNowSessions] = useState<SessionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [maxDistance, setMaxDistance] = useState<number>(100);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showSafetyWaiver, setShowSafetyWaiver] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [liveStatusMap, setLiveStatusMap] = useState<
    Record<string, { count: number; users: Array<{ name: string; avatar_url: string | null }> }>
  >({});
  const [liveUserIdSet, setLiveUserIdSet] = useState<Set<string>>(new Set());
  const [fixedHeight, setFixedHeight] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    checkUser();
    getUserLocation().then((loc) => {
      if (loc) setUserLocation(loc);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userChecked) return;
    scheduleSessionReminders();
    if (user) tryRegisterPushNotifications(user.id);
    loadProfile();
    loadSessions();
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
  useEffect(() => {
    filterSessions();
    setVisibleCount(PAGE_SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter deps tracked explicitly
  }, [sessions, searchQuery, selectedSport, maxDistance, userLocation, dateFilter, genderFilter]);

  async function tryRegisterPushNotifications(userId: string) {
    try {
      const isNative = (await import('@capacitor/core')).Capacitor.isNativePlatform();
      if (isNative || ('Notification' in window && Notification.permission === 'granted'))
        await registerForPushNotifications(userId);
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
    const { data } = await supabase
      .from('users')
      .select('name, avatar_url, bio, sports, safety_waiver_accepted')
      .eq('id', user.id)
      .maybeSingle();
    setUserProfile(data);
  }

  async function loadSessions() {
    try {
      setLoading(true);
      setFetchError(false);
      const result = await fetchUpcomingSessions(supabase);
      if (!result.success) throw new Error(result.error);
      setSessions(result.data || []);
      loadLiveStatuses((result.data || []).map((s) => s.id));
    } catch (error) {
      logError(error, { action: 'loadSessions' });
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadLiveStatuses(sessionIds: string[]) {
    if (sessionIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('live_status')
        .select('session_id, user_id, user:users(name, avatar_url)')
        .in('session_id', sessionIds)
        .gt('expires_at', new Date().toISOString());
      if (error || !data) return;
      const map: Record<string, { count: number; users: Array<{ name: string; avatar_url: string | null }> }> = {};
      const userIds = new Set<string>();
      for (const row of data) {
        const typed = row as unknown as {
          session_id: string;
          user_id: string;
          user: { name: string; avatar_url: string | null } | null;
        };
        const sid = typed.session_id;
        userIds.add(typed.user_id);
        if (!map[sid]) map[sid] = { count: 0, users: [] };
        map[sid].count++;
        map[sid].users.push({ name: typed.user?.name || 'Unknown', avatar_url: typed.user?.avatar_url || null });
      }
      setLiveStatusMap(map);
      setLiveUserIdSet(userIds);
    } catch (error) {
      logError(error, { action: 'loadLiveStatuses' });
    }
  }

  function filterSessions() {
    const now = new Date();
    setLiveNowSessions(
      sessions.filter((s) => {
        if (!s.is_training_now) return false;
        const sessionStart = new Date(`${s.date}T${s.start_time}`);
        const sessionEnd = new Date(sessionStart.getTime() + (s.duration || 60) * 60000);
        return sessionStart <= new Date(now.getTime() + 120 * 60000) && sessionEnd > now;
      })
    );

    let filtered = [...sessions];
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.sport?.toLowerCase().includes(query) ||
          s.location?.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query)
      );
    }
    if (selectedSport) filtered = filtered.filter((s) => s.sport === selectedSport);
    if (userLocation && maxDistance < 100) {
      filtered = filtered.filter((s) => {
        if (!s.latitude || !s.longitude) return true;
        return calculateDistance(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude) <= maxDistance;
      });
    }
    if (dateFilter !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date();
      if (dateFilter === 'today') endDate.setHours(23, 59, 59, 999);
      else if (dateFilter === 'week') endDate.setDate(today.getDate() + 7);
      else if (dateFilter === 'month') endDate.setMonth(today.getMonth() + 1);
      filtered = filtered.filter((s) => {
        const sessionDate = new Date(s.date + 'T00:00:00');
        return sessionDate >= today && sessionDate <= endDate;
      });
    }
    if (genderFilter !== 'all') {
      filtered = filtered.filter(
        (s) => s.gender_preference === genderFilter || s.gender_preference === 'all' || !s.gender_preference
      );
    }
    setFilteredSessions(filtered);
  }

  function handleShareSession(session: SessionWithRelations) {
    const shareText =
      language === 'es'
        ? `¡Únete a ${session.sport} el ${new Date(session.date + 'T00:00:00').toLocaleDateString('es-ES')}! Nunca entrenes solo 💪`
        : `Join me for ${session.sport} on ${new Date(session.date + 'T00:00:00').toLocaleDateString('en-US')}! Never train alone 💪`;
    const shareUrl = `${window.location.origin}/session/${session.id}`;
    if (navigator.share) {
      navigator.share({ title: 'Tribe - ' + session.sport, text: shareText, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText + '\n' + shareUrl);
      showInfo(language === 'es' ? 'Enlace copiado' : 'Link copied!');
    }
  }

  async function handleJoinSession(sessionId: string) {
    if (!user) return;
    if (userProfile && !userProfile.safety_waiver_accepted) {
      setPendingSessionId(sessionId);
      setShowSafetyWaiver(true);
      return;
    }
    try {
      const result = await joinSession({
        supabase,
        sessionId,
        userId: user.id,
        userName: userProfile?.name || user.email || 'Someone',
      });
      if (!result.success) {
        const errorMessages: Record<string, string> = {
          session_not_found: 'Session not found',
          session_not_active: 'This session is no longer active',
          self_join: 'You cannot join your own session!',
          already_joined: t('alreadyJoined'),
          capacity_full: t('sessionFullMsg'),
          invite_only: 'This is a private session. You need a direct invitation from the host.',
        };
        showInfo(errorMessages[result.error!] || result.error || 'Could not join session');
        return;
      }
      showSuccess(
        result.status === 'pending'
          ? 'Request sent! The host will review your profile and decide.'
          : t('joinedSuccessfully')
      );
      await loadSessions();
    } catch (error: unknown) {
      logError(error, { action: 'handleJoinSession' });
      showError(getErrorMessage(error, 'join_session', language));
    }
  }

  async function handleWaiverAccepted() {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('users')
        .update({ safety_waiver_accepted: true, safety_waiver_accepted_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      if (userProfile) setUserProfile({ ...userProfile, safety_waiver_accepted: true });
      setShowSafetyWaiver(false);
      if (pendingSessionId) {
        await handleJoinSession(pendingSessionId);
        setPendingSessionId(null);
      }
    } catch (error) {
      logError(error, { action: 'handleWaiverAccepted' });
      showError(getErrorMessage(error, 'accept_waiver', language));
    }
  }

  async function handleDeleteSession(id: string) {
    if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
    try {
      const result = await dalDeleteSession(supabase, id);
      if (!result.success) throw new Error(result.error);
      showSuccess('Session deleted successfully!');
      await loadSessions();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'delete_session', language));
    }
  }

  function getDistanceText(session: SessionWithRelations): string | undefined {
    if (!userLocation || !session.latitude || !session.longitude) return undefined;
    return formatDistance(
      calculateDistance(userLocation.latitude, userLocation.longitude, session.latitude, session.longitude),
      language
    );
  }

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
    filteredSessions,
    liveNowSessions,
    loading,
    searchQuery,
    setSearchQuery,
    selectedSport,
    setSelectedSport,
    maxDistance,
    setMaxDistance,
    dateFilter,
    setDateFilter,
    genderFilter,
    setGenderFilter,
    showSafetyWaiver,
    setShowSafetyWaiver,
    setPendingSessionId,
    liveStatusMap,
    liveUserIdSet,
    fixedHeight,
    setFixedHeight,
    visibleCount,
    setVisibleCount,
    fetchError,
    PAGE_SIZE,
    loadSessions,
    handleShareSession,
    handleJoinSession,
    handleWaiverAccepted,
    handleDeleteSession,
    getDistanceText,
  };
}
