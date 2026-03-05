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
import {
  fetchUpcomingSessions,
  deleteSession as dalDeleteSession,
  fetchUserProfileMaybe,
  updateUser,
  fetchLiveUsersWithDetails,
} from '@/lib/dal';
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
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'default';
    onConfirm: () => void;
  } | null>(null);

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
    const result = await fetchUserProfileMaybe(
      supabase,
      user.id,
      'name, avatar_url, bio, sports, safety_waiver_accepted'
    );
    setUserProfile((result.data as UserProfile | null) ?? null);
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
      const results = await Promise.all(
        sessionIds.map((sid) => fetchLiveUsersWithDetails(supabase, sid).then((r) => ({ sid, r })))
      );
      const map: Record<string, { count: number; users: Array<{ name: string; avatar_url: string | null }> }> = {};
      const userIds = new Set<string>();
      for (const { sid, r } of results) {
        if (!r.success || !r.data || r.data.length === 0) continue;
        for (const row of r.data) {
          const typed = row as { user_id: string; user: { name: string; avatar_url: string | null } | null };
          userIds.add(typed.user_id);
          if (!map[sid]) map[sid] = { count: 0, users: [] };
          map[sid].count++;
          map[sid].users.push({ name: typed.user?.name || 'Unknown', avatar_url: typed.user?.avatar_url || null });
        }
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
          session_not_found: language === 'es' ? 'Sesión no encontrada' : 'Session not found',
          session_not_active: language === 'es' ? 'Esta sesión ya no está activa' : 'This session is no longer active',
          self_join: language === 'es' ? '¡No puedes unirte a tu propia sesión!' : 'You cannot join your own session!',
          already_joined: t('alreadyJoined'),
          capacity_full: t('sessionFullMsg'),
          invite_only:
            language === 'es'
              ? 'Esta es una sesión privada. Necesitas una invitación directa del anfitrión.'
              : 'This is a private session. You need a direct invitation from the host.',
        };
        showInfo(
          errorMessages[result.error!] ||
            result.error ||
            (language === 'es' ? 'No se pudo unir a la sesión' : 'Could not join session')
        );
        return;
      }
      showSuccess(
        result.status === 'pending'
          ? language === 'es'
            ? '¡Solicitud enviada! El anfitrión revisará tu perfil y decidirá.'
            : 'Request sent! The host will review your profile and decide.'
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
      const result = await updateUser(supabase, user.id, {
        safety_waiver_accepted: true,
        safety_waiver_accepted_at: new Date().toISOString(),
      });
      if (!result.success) throw new Error(result.error);
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

  function handleDeleteSession(id: string) {
    setConfirmAction({
      title: t('delete'),
      message: t('deleteSessionConfirm'),
      confirmLabel: t('delete'),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const result = await dalDeleteSession(supabase, id);
          if (!result.success) throw new Error(result.error);
          showSuccess(language === 'es' ? '¡Sesión eliminada exitosamente!' : 'Session deleted successfully!');
          await loadSessions();
        } catch (error: unknown) {
          showError(getErrorMessage(error, 'delete_session', language));
        }
      },
    });
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
    confirmAction,
    setConfirmAction,
    PAGE_SIZE,
    loadSessions,
    handleShareSession,
    handleJoinSession,
    handleWaiverAccepted,
    handleDeleteSession,
    getDistanceText,
  };
}
