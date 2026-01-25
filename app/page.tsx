'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect } from 'react';
import OnboardingModal from '@/components/OnboardingModal';
import EditSessionModal from '@/components/EditSessionModal';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SessionCard from '@/components/SessionCard';
import BottomNav from '@/components/BottomNav';
import NotificationPrompt from '@/components/NotificationPrompt';
import LanguageToggle from '@/components/LanguageToggle';
import ProfileCompletionBanner from '@/components/ProfileCompletionBanner';
import { SkeletonCard } from "@/components/Skeleton";
import SafetyWaiverModal from '@/components/SafetyWaiverModal';
import { Search, X, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { getUserLocation } from '@/lib/location';
import { scheduleSessionReminders } from '@/lib/reminders';
import { calculateDistance, formatDistance } from '@/lib/distance';
import { sportTranslations } from '@/lib/translations';

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [userChecked, setUserChecked] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    // Use user-specific key so each user gets their own onboarding
    const hasSeenOnboarding = localStorage.getItem(`hasSeenOnboarding_${user.id}`);
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, [userChecked, user]);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [liveNowSessions, setLiveNowSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [maxDistance, setMaxDistance] = useState<number>(50);
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showSafetyWaiver, setShowSafetyWaiver] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const sports = Object.keys(sportTranslations);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (userChecked) {
      scheduleSessionReminders();
      requestNotificationPermission();
      loadProfile();
    }
  }, [userChecked]);

  useEffect(() => {
    if (userChecked) {
      loadSessions();
    }
  }, [userChecked]);

  useEffect(() => {
    getUserLocation().then(loc => {
      if (loc) setUserLocation(loc);
    });
  }, []);

  useEffect(() => {
    filterSessions();
  }, [sessions, searchQuery, selectedSport, maxDistance, userLocation, dateFilter, genderFilter]);

  async function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    const hasAsked = localStorage.getItem("notificationPrompted");
    if (hasAsked) return;
    
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      localStorage.setItem("notificationPrompted", "true");
      if (permission === "granted") {
        new Notification("Tribe.", {
          body: "You will now receive notifications for sessions and messages!",
          icon: "/icon-192.png"
        });
      }
    }
  }

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setUser(null);
      setUserChecked(true); // Guests can browse
    } else {
      setUser(user);
      setUserChecked(true);
    }
  }

  async function loadProfile() {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('avatar_url, sports, safety_waiver_accepted')
      .eq('id', user.id)
      .maybeSingle();
    setUserProfile(data);
  }

  async function loadSessions() {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          participants:session_participants(
            user_id,
            status,
            user:users(id, name, avatar_url)
          ),
          creator:users!sessions_creator_id_fkey(id, name, avatar_url, average_rating, total_reviews)
        `)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditSession(sessionId: string) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setEditingSession(session);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm("Are you sure you want to delete this session? This cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase.from("sessions").delete().eq("id", sessionId);
      if (error) throw error;

      showSuccess("Session deleted successfully!");
      await loadSessions();
    } catch (error: any) {
      showError("Error: " + error.message);
    }
  }

  function filterSessions() {
    // Filter Live Now sessions (is_training_now = true AND happening soon or active)
    const now = new Date();
    const liveFiltered = sessions.filter(s => {
      if (!s.is_training_now) return false;
      const sessionStart = new Date(`${s.date}T${s.start_time}`);
      const sessionEnd = new Date(sessionStart.getTime() + (s.duration || 60) * 60000);
      // Show if starting within 2 hours OR currently active (expanded from 30 min)
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

    if (selectedSport) {
      filtered = filtered.filter((s) => s.sport === selectedSport);
    }

    if (userLocation && maxDistance < 100) {
      filtered = filtered.filter((s) => {
        if (!s.latitude || !s.longitude) return true;
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          s.latitude,
          s.longitude
        );
        return distance <= maxDistance;
      });

    // Date filter
    if (dateFilter !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let endDate = new Date();
      if (dateFilter === "today") {
        endDate.setHours(23, 59, 59, 999);
      } else if (dateFilter === "week") {
        endDate.setDate(today.getDate() + 7);
      } else if (dateFilter === "month") {
        endDate.setMonth(today.getMonth() + 1);
      }
      
      filtered = filtered.filter((s) => {
        const sessionDate = new Date(s.date);
        return sessionDate >= today && sessionDate <= endDate;
      });
    }

    // Gender filter
    if (genderFilter !== "all") {
      filtered = filtered.filter((s) => {
        // Show sessions that match the filter OR sessions open to all
        return s.gender_preference === genderFilter || s.gender_preference === 'all' || !s.gender_preference;
      });
    }
    }
    setFilteredSessions(filtered);
  }


  function handleShareSession(session: any) {
    const shareText = language === "es"
      ? `¡Únete a ${session.sport} el ${new Date(session.date).toLocaleDateString("es-ES")}! Nunca entrenes solo 💪`
      : `Join me for ${session.sport} on ${new Date(session.date).toLocaleDateString("en-US")}! Never train alone 💪`;
    
    const shareUrl = `${window.location.origin}/session/${session.id}`;
    
    if (navigator.share) {
      navigator.share({
        title: "Tribe - " + session.sport,
        text: shareText,
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText + "\n" + shareUrl);
      showInfo(language === "es" ? "Enlace copiado" : "Link copied!");
    }
  }
  async function handleJoinSession(sessionId: string) {
    if (!user) return;

    if (userProfile && !userProfile.safety_waiver_accepted) {
      setPendingSessionId(sessionId);
      setShowSafetyWaiver(true);
      return;
    }

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    if (session.creator_id === user.id) {
      showInfo('You cannot join your own session!');
      return;
    }

    if (session.join_policy === 'invite_only') {
      showInfo('This is a private session. You need a direct invitation from the host.');
      return;
    }

    if (session.current_participants >= session.max_participants) {
      showInfo(t('sessionFullMsg'));
      return;
    }

    try {
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id, status')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        showInfo(t('alreadyJoined'));
        return;
      }

      const status = session.join_policy === 'curated' ? 'pending' : 'confirmed';

      const { error: joinError } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          status: status,
        });

      if (joinError) throw joinError;

      if (status === 'confirmed') {
        const { error: updateError } = await supabase
          .from('sessions')
          .update({ current_participants: session.current_participants + 1 })
          .eq('id', sessionId);

        if (updateError) throw updateError;
      }

      const message = session.join_policy === 'curated' 
        ? 'Request sent! The host will review your profile and decide.' 
        : t('joinedSuccessfully');
      
      showSuccess(message);
      await loadSessions();
    } catch (error: any) {
      console.error('Error joining session:', error);
      showError('Error: ' + error.message);
    }
  }


  async function handleWaiverAccepted() {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('users')
        .update({
          safety_waiver_accepted: true,
          safety_waiver_accepted_at: new Date().toISOString()
        })
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
      showError('Error accepting waiver. Please try again.');
    }
  }

  function handleWaiverCancelled() {
    setShowSafetyWaiver(false);
    setPendingSessionId(null);
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
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black safe-area-top">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/profile">
            <h1 className="text-xl font-bold text-stone-900 dark:text-white cursor-pointer">Tribe<span className="text-tribe-green">.</span>
            </h1>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/messages" className="text-stone-700 dark:text-gray-300 hover:text-tribe-green transition-colors">
              <MessageCircle className="w-6 h-6" />
            </Link>
            <LanguageToggle />
          </div>
        </div>
      </div>

      <div className="bg-stone-200 dark:bg-[#272D34] p-4 sticky top-0 z-10 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-3 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
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

          <select
            value={selectedSport}
            onChange={(e) => setSelectedSport(e.target.value)}
            className="w-full p-3 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green"
          >
            <option value="">{language === 'es' ? 'Todos' : 'All'}</option>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {language === 'es' ? (sportTranslations[sport]?.es || sport) : sport}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full p-3 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green"
            >
              <option value="all">{language === 'es' ? 'Todas las fechas' : 'All dates'}</option>
              <option value="today">{language === 'es' ? 'Hoy' : 'Today'}</option>
              <option value="week">{language === 'es' ? 'Esta semana' : 'This week'}</option>
              <option value="month">{language === 'es' ? 'Este mes' : 'This month'}</option>
            </select>

            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full p-3 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg text-stone-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-tribe-green"
            >
              <option value="all">{language === 'es' ? 'Todos' : 'All'} 👥</option>
              <option value="women_only">{language === 'es' ? 'Solo Mujeres' : 'Women Only'} 👩</option>
              <option value="men_only">{language === 'es' ? 'Solo Hombres' : 'Men Only'} 👨</option>
            </select>
          </div>

          {userLocation && (
            <div className="flex items-center gap-3 bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-lg px-4 py-2">
              <label className="text-sm font-medium text-stone-900 dark:text-gray-100 whitespace-nowrap">
                {language === 'es' ? 'Distancia' : 'Distance'}:
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
              <span className="text-sm font-semibold text-tribe-green min-w-[60px] text-right">
                {maxDistance === 100 ? (language === 'es' ? 'Todas' : 'All') : `${maxDistance}km`}
              </span>
            </div>
          )}

          {(!loading || searchQuery || selectedSport) && (
            <div className="flex items-center justify-between">
              {!loading && (
                <p className="text-sm text-stone-600 dark:text-gray-300">
                  {filteredSessions.length} {t('sessionsCount')}
                </p>
              )}
              {(searchQuery || selectedSport) && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSport('');
                  }}
                  className="text-sm text-tribe-green hover:underline"
                >
                  {t('clearAll')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

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

        {/* Profile Completion Banner - only show if profile is incomplete */}
        {user && userProfile && (!userProfile.avatar_url || !userProfile.sports?.length) && (
          <ProfileCompletionBanner
            hasPhoto={!!userProfile.avatar_url}
            hasSports={userProfile.sports && userProfile.sports.length > 0}
            userId={user.id}
          />
        )}

        {/* Training Now Button */}
        {user && (
          <button
            onClick={() => router.push("/training-now")}
            className="w-full py-4 bg-gradient-to-r from-tribe-green to-lime-400 text-slate-900 font-bold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-3 shadow-lg mb-4"
          >
            <div className="text-center">
              <div className="text-lg">{language === 'es' ? 'ENTRENAR AHORA' : 'TRAINING NOW'}</div>
              <div className="text-xs font-normal opacity-75">{language === 'es' ? 'Conecta con personas entrenando cerca' : 'Connect with people training nearby'}</div>
            </div>
          </button>
        )}

        {/* Live Now Section */}
        {liveNowSessions.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <div className="absolute inset-0 w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
              </div>
              <h2 className="text-lg font-bold text-theme-primary">
                {language === "es" ? "EN VIVO AHORA" : "LIVE NOW"} ({liveNowSessions.length})
              </h2>
            </div>
            <div className="space-y-3">
              {liveNowSessions.map((session) => {
                const sessionStart = new Date(`${session.date}T${session.start_time}`);
                const now = new Date();
                const diffMs = sessionStart.getTime() - now.getTime();
                const diffMins = Math.round(diffMs / 60000);
                const sessionEnd = new Date(sessionStart.getTime() + (session.duration || 60) * 60000);
                const minsLeft = Math.round((sessionEnd.getTime() - now.getTime()) / 60000);

                let statusText = "";
                if (diffMins > 0) {
                  statusText = language === "es" ? `Empieza en ${diffMins} min` : `Starting in ${diffMins} min`;
                } else {
                  statusText = language === "es" ? `${minsLeft} min restantes` : `${minsLeft} min left`;
                }

                // Calculate distance for live sessions
                let liveDistanceText = "";
                if (userLocation && session.latitude && session.longitude) {
                  const distanceKm = calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    session.latitude,
                    session.longitude
                  );
                  liveDistanceText = formatDistance(distanceKm, language);
                }

                return (
                  <Link key={session.id} href={`/session/${session.id}`}>
                    <div className="bg-gradient-to-r from-green-50 to-lime-50 dark:from-green-900/20 dark:to-lime-900/20 border-2 border-green-400 dark:border-green-600 rounded-xl p-4 hover:shadow-lg transition cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-tribe-green rounded-full flex items-center justify-center text-lg">
                            {session.sport === "Running" ? "🏃" : session.sport === "CrossFit" ? "🏋️" : session.sport === "Swimming" ? "🏊" : session.sport === "Cycling" ? "🚴" : session.sport === "Boxing" ? "🥊" : session.sport === "Jiu-Jitsu" ? "🥋" : "💪"}
                          </div>
                          <div>
                            <div className="font-bold text-theme-primary">{session.creator?.name || "Someone"} - {session.sport}</div>
                            <div className="text-sm text-theme-secondary truncate max-w-[200px]">
                              {session.location}
                              {liveDistanceText && (
                                <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-medium">
                                  ({liveDistanceText})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-medium text-green-600 dark:text-green-400">{statusText}</div>
                          <button className="mt-1 px-4 py-1.5 bg-tribe-green text-slate-900 text-sm font-bold rounded-full hover:bg-lime-500 transition">
                            {language === "es" ? "Unirse" : "Join"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

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
            {filteredSessions.map((session) => {
              // Calculate distance if user location and session coordinates are available
              let distanceText: string | undefined;
              if (userLocation && session.latitude && session.longitude) {
                const distanceKm = calculateDistance(
                  userLocation.latitude,
                  userLocation.longitude,
                  session.latitude,
                  session.longitude
                );
                distanceText = formatDistance(distanceKm, language);
              }

              return (
                <SessionCard
                  key={session.id}
                  session={session}
                  onJoin={handleJoinSession}
                  userLocation={userLocation}
                  currentUserId={user?.id}
                  onEdit={handleEditSession}
                  onDelete={handleDeleteSession}
                  onShare={handleShareSession}
                  distance={distanceText}
                />
              );
            })}
          </div>
        )}
      </div>

      {showSafetyWaiver && (
        <SafetyWaiverModal
          onAccept={handleWaiverAccepted}
          onCancel={handleWaiverCancelled}
        />
      )}


      <BottomNav />
      <NotificationPrompt hideWhenOnboarding={showOnboarding} />
    </div>
  );
}
