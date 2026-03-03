'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect, useCallback } from 'react';
import OnboardingModal from '@/components/OnboardingModal';
import EditSessionModal from '@/components/EditSessionModal';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SessionCard from '@/components/SessionCard';
import BottomNav from '@/components/BottomNav';
import NotificationPrompt from '@/components/NotificationPrompt';
import ProfileCompletionBanner from '@/components/ProfileCompletionBanner';
import { SkeletonCard } from '@/components/Skeleton';
import SafetyWaiverModal from '@/components/SafetyWaiverModal';
import StoriesRow from '@/components/StoriesRow';
import FilterBar from '@/components/home/FilterBar';
import LiveNowSection from '@/components/home/LiveNowSection';
import { useLanguage } from '@/lib/LanguageContext';
import { getUserLocation } from '@/lib/location';
import { scheduleSessionReminders } from '@/lib/reminders';
import { calculateDistance, formatDistance } from '@/lib/distance';
import { registerForPushNotifications } from '@/lib/firebase-messaging';
import { joinSession } from '@/lib/sessions';
import { getErrorMessage } from '@/lib/errorMessages';
import { fetchUpcomingSessions, deleteSession as dalDeleteSession } from '@/lib/dal';

const PAGE_SIZE = 20;

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [liveNowSessions, setLiveNowSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [maxDistance, setMaxDistance] = useState<number>(100);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showSafetyWaiver, setShowSafetyWaiver] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [liveStatusMap, setLiveStatusMap] = useState<
    Record<string, { count: number; users: Array<{ name: string; avatar_url: string | null }> }>
  >({});
  const [liveUserIdSet, setLiveUserIdSet] = useState<Set<string>>(new Set());
  const [fixedHeight, setFixedHeight] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (userChecked) {
      scheduleSessionReminders();
      if (user) tryRegisterPushNotifications(user.id);
      loadProfile();
    }
  }, [userChecked]);

  useEffect(() => {
    if (!user || !userProfile) return;
    const isProfileComplete = userProfile.avatar_url && userProfile.sports?.length > 0;
    if (isProfileComplete) {
      setShowOnboarding(false);
      return;
    }
    const hasSeenOnboarding = localStorage.getItem(`hasSeenOnboarding_${user.id}`);
    if (!hasSeenOnboarding) setShowOnboarding(true);
  }, [user, userProfile]);

  useEffect(() => {
    if (userChecked) loadSessions();
  }, [userChecked]);
  useEffect(() => {
    getUserLocation().then((loc) => {
      if (loc) setUserLocation(loc);
    });
  }, []);
  useEffect(() => {
    filterSessions();
    setVisibleCount(PAGE_SIZE);
  }, [sessions, searchQuery, selectedSport, maxDistance, userLocation, dateFilter, genderFilter]);

  async function tryRegisterPushNotifications(userId: string) {
    try {
      const isNative = (await import('@capacitor/core')).Capacitor.isNativePlatform();
      if (isNative) {
        await registerForPushNotifications(userId);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        await registerForPushNotifications(userId);
      }
    } catch (error) {
      console.error('[FCM] Error in tryRegisterPushNotifications:', error);
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
      const result = await fetchUpcomingSessions(supabase);
      if (!result.success) throw new Error(result.error);
      setSessions(result.data || []);
      loadLiveStatuses((result.data || []).map((s: any) => s.id));
    } catch (error) {
      console.error('Error loading sessions:', error);
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
        const sid = (row as any).session_id;
        const uid = (row as any).user_id;
        const userInfo = (row as any).user;
        userIds.add(uid);
        if (!map[sid]) map[sid] = { count: 0, users: [] };
        map[sid].count++;
        map[sid].users.push({ name: userInfo?.name || 'Unknown', avatar_url: userInfo?.avatar_url || null });
      }
      setLiveStatusMap(map);
      setLiveUserIdSet(userIds);
    } catch (error) {
      console.error('Error loading live statuses:', error);
    }
  }

  function filterSessions() {
    const now = new Date();
    const liveFiltered = sessions.filter((s) => {
      if (!s.is_training_now) return false;
      const sessionStart = new Date(`${s.date}T${s.start_time}`);
      const sessionEnd = new Date(sessionStart.getTime() + (s.duration || 60) * 60000);
      const twoHoursFromNow = new Date(now.getTime() + 120 * 60000);
      return sessionStart <= twoHoursFromNow && sessionEnd > now;
    });
    setLiveNowSessions(liveFiltered);

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

  function handleShareSession(session: any) {
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
    } catch (error: any) {
      console.error('Error joining session:', error);
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
      setUserProfile({ ...userProfile, safety_waiver_accepted: true });
      setShowSafetyWaiver(false);
      if (pendingSessionId) {
        await handleJoinSession(pendingSessionId);
        setPendingSessionId(null);
      }
    } catch (error) {
      console.error('Error accepting waiver:', error);
      showError(getErrorMessage(error, 'accept_waiver', language));
    }
  }

  return (
    <div className="min-h-screen pb-32 bg-stone-50 dark:bg-[#52575D]">
      {showOnboarding && user && (
        <OnboardingModal
          onComplete={() => {
            localStorage.setItem(`hasSeenOnboarding_${user.id}`, 'true');
            setShowOnboarding(false);
          }}
        />
      )}

      <FilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedSport={selectedSport}
        setSelectedSport={setSelectedSport}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        genderFilter={genderFilter}
        setGenderFilter={setGenderFilter}
        maxDistance={maxDistance}
        setMaxDistance={setMaxDistance}
        userLocation={userLocation}
        loading={loading}
        filteredCount={filteredSessions.length}
        language={language}
        t={t}
        onFixedHeightChange={setFixedHeight}
      />

      <div style={{ paddingTop: fixedHeight || undefined }} className={fixedHeight ? '' : 'pt-header'}>
        <div className="max-w-2xl mx-auto p-4">
          {editingSession && (
            <EditSessionModal
              session={editingSession}
              onClose={() => setEditingSession(null)}
              onSave={() => {
                loadSessions();
                setEditingSession(null);
              }}
            />
          )}

          <div className="mt-1">
            <StoriesRow userId={user?.id || null} userAvatar={userProfile?.avatar_url} liveUserIds={liveUserIdSet} />
          </div>

          {user && userProfile && (
            <ProfileCompletionBanner
              hasPhoto={!!userProfile.avatar_url}
              hasSports={userProfile.sports && userProfile.sports.length > 0}
              hasName={!!userProfile.name}
              userId={user.id}
            />
          )}

          {user && (
            <button
              onClick={() => router.push('/training-now')}
              className="w-full py-4 bg-gradient-to-r from-tribe-green to-lime-400 text-slate-900 font-bold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-3 shadow-lg mb-4"
            >
              <div className="text-center">
                <div className="text-lg">{language === 'es' ? 'ENTRENAR AHORA' : 'TRAINING NOW'}</div>
                <div className="text-xs font-normal opacity-75">
                  {language === 'es' ? 'Conecta con personas entrenando cerca' : 'Connect with people training nearby'}
                </div>
              </div>
            </button>
          )}

          <LiveNowSection liveNowSessions={liveNowSessions} userLocation={userLocation} language={language} />

          {loading ? (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
              <div className="text-4xl mb-4">🏃‍♂️</div>
              <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('noSessionsFound')}</p>
              <p className="text-sm text-stone-500 dark:text-gray-400 mb-4">{t('tryDifferentSearch')}</p>
              <Link href="/create">
                <button className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">
                  {language === 'es' ? 'Crear Sesión' : 'Create Session'}
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSessions.slice(0, visibleCount).map((session) => {
                let distanceText: string | undefined;
                if (userLocation && session.latitude && session.longitude) {
                  distanceText = formatDistance(
                    calculateDistance(
                      userLocation.latitude,
                      userLocation.longitude,
                      session.latitude,
                      session.longitude
                    ),
                    language
                  );
                }
                return (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onJoin={handleJoinSession}
                    userLocation={userLocation}
                    currentUserId={user?.id}
                    onEdit={(id: string) => {
                      const s = sessions.find((s) => s.id === id);
                      if (s) setEditingSession(s);
                    }}
                    onDelete={async (id: string) => {
                      if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
                      try {
                        const result = await dalDeleteSession(supabase, id);
                        if (!result.success) throw new Error(result.error);
                        showSuccess('Session deleted successfully!');
                        await loadSessions();
                      } catch (error: any) {
                        showError(getErrorMessage(error, 'delete_session', language));
                      }
                    }}
                    onShare={handleShareSession}
                    distance={distanceText}
                    liveData={liveStatusMap[session.id]}
                  />
                );
              })}
              {visibleCount < filteredSessions.length && (
                <button
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="w-full py-3 bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white font-medium rounded-xl border border-stone-200 dark:border-[#52575D] hover:bg-stone-100 dark:hover:bg-[#7D8490] transition"
                >
                  {language === 'es'
                    ? `Mostrar más (${filteredSessions.length - visibleCount} restantes)`
                    : `Show more (${filteredSessions.length - visibleCount} remaining)`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showSafetyWaiver && (
        <SafetyWaiverModal
          onAccept={handleWaiverAccepted}
          onCancel={() => {
            setShowSafetyWaiver(false);
            setPendingSessionId(null);
          }}
        />
      )}

      <BottomNav />
      <NotificationPrompt hideWhenOnboarding={showOnboarding} />
    </div>
  );
}
