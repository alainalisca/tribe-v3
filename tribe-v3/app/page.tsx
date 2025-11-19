'use client';

import { useState, useEffect } from 'react';
import OnboardingModal from '@/components/OnboardingModal';
import EditSessionModal from '@/components/EditSessionModal';
import ProfilePrompt from '@/components/ProfilePrompt';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SessionCard from '@/components/SessionCard';
import BottomNav from '@/components/BottomNav';
import NotificationPrompt from '@/components/NotificationPrompt';
import LanguageToggle from '@/components/LanguageToggle';
import ProfileCompletionBanner from '@/components/ProfileCompletionBanner';
import SafetyWaiverModal from '@/components/SafetyWaiverModal';
import { Search, X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { getUserLocation } from '@/lib/location';
import { scheduleSessionReminders } from '@/lib/reminders';
import { calculateDistance } from '@/lib/distance';
import { sportTranslations } from '@/lib/translations';

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding && user) {
      setShowOnboarding(true);
    }
  }, [user]);
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [maxDistance, setMaxDistance] = useState<number>(50);
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [userProfile, setUserProfile] = useState<any>(null);
  const [showSafetyWaiver, setShowSafetyWaiver] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  const sports = Object.keys(sportTranslations);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      scheduleSessionReminders();
      loadProfile();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadSessions();
    }
  }, [user]);

  useEffect(() => {
    getUserLocation().then(loc => {
      if (loc) setUserLocation(loc);
    });
  }, []);

  useEffect(() => {
    filterSessions();
  }, [sessions, searchQuery, selectedSport, maxDistance, userLocation, dateFilter]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
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
          creator:users!sessions_creator_id_fkey(id, name, avatar_url)
        `)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      console.log('Loaded sessions with participants:', data);
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

      alert("Session deleted successfully!");
      await loadSessions();
    } catch (error: any) {
      alert("Error: " + error.message);
    }
  }

  function filterSessions() {
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
    }
    setFilteredSessions(filtered);
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
      alert('You cannot join your own session!');
      return;
    }

    if (session.join_policy === 'invite_only') {
      alert('This is a private session. You need a direct invitation from the host.');
      return;
    }

    if (session.current_participants >= session.max_participants) {
      alert(t('sessionFullMsg'));
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
        alert(t('alreadyJoined'));
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
      
      alert(message);
      await loadSessions();
    } catch (error: any) {
      console.error('Error joining session:', error);
      alert('Error: ' + error.message);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        {showOnboarding && (
          <OnboardingModal
            onComplete={() => {
              localStorage.setItem('hasSeenOnboarding', 'true');
              setShowOnboarding(false);
              setShowProfilePrompt(true);
            }}
          />
        )}
        <p className="text-stone-900 dark:text-gray-100">{t('loading')}</p>
      </div>
    );
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
      alert('Error accepting waiver. Please try again.');
    }
  }

  function handleWaiverCancelled() {
    setShowSafetyWaiver(false);
    setPendingSessionId(null);
  }

  return (
    <div className="min-h-screen pb-20 bg-stone-50 dark:bg-[#52575D]">
      {showOnboarding && (
        <OnboardingModal
          onComplete={() => {
            localStorage.setItem('hasSeenOnboarding', 'true');
            setShowOnboarding(false);
            setShowProfilePrompt(true);
          }}
        />
      )}
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/profile">
            <h1 className="text-xl font-bold text-stone-900 dark:text-white cursor-pointer">
              Tribe<span className="text-tribe-green">.</span>
            </h1>
          </Link>
          <LanguageToggle />
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
            <option value="">{t('sportsActivities')}</option>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {language === 'es' ? (sportTranslations[sport]?.es || sport) : sport}
              </option>
            ))}
          </select>

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

          <div className="flex items-center justify-between">
            <p className="text-sm text-stone-600 dark:text-gray-300">
              {filteredSessions.length} {t('sessionsCount')}
            </p>
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
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {showProfilePrompt && (
          <ProfilePrompt onDismiss={() => setShowProfilePrompt(false)} />
        )}

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
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-white dark:bg-[#6B7178] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
            <p className="text-stone-600 dark:text-gray-300 mb-2">{t('noSessionsFound')}</p>
            <p className="text-sm text-stone-500 dark:text-gray-400">{t('tryDifferentSearch')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onJoin={handleJoinSession}
                userLocation={userLocation}
                currentUserId={user?.id}
                onEdit={handleEditSession}
                onDelete={handleDeleteSession}
              />
            ))}
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
      <NotificationPrompt />
    </div>
  );
}
