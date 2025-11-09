'use client';

import { useState, useEffect } from 'react';
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
  const [filteredSessions, setFilteredSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('');
  const [maxDistance, setMaxDistance] = useState<number>(50); // Default 50km
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
    if (user) {
      scheduleSessionReminders();
      loadProfile();
    }
  }, [user]);

  useEffect(() => {
    filterSessions();
  }, [sessions, searchQuery, selectedSport, maxDistance, userLocation]);

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
      .single();
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
          participants:session_participants(user_id),
          creator:users!sessions_creator_id_fkey(id, name, avatar_url)
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


    // Filter by distance if user has location
    if (userLocation && maxDistance < 100) {
      filtered = filtered.filter((s) => {
        if (!s.latitude || !s.longitude) return true; // Keep sessions without location
        const distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          s.latitude,
          s.longitude
        );
        return distance <= maxDistance;
      });
    }
    setFilteredSessions(filtered);
  }

  async function handleJoinSession(sessionId: string) {
    // Check if user has accepted safety waiver
    if (userProfile && !userProfile.safety_waiver_accepted) {
      setPendingSessionId(sessionId);
      setShowSafetyWaiver(true);
      return;
    }

    const session = sessions.find((s) => s.id === sessionId);

    // Prevent creator from joining own session
    if (session.creator_id === user.id) {
      alert('You cannot join your own session!');
      return;
    }

    // Check join policy
    if (session.join_policy === 'invite_only') {
      alert('This is a private session. You need a direct invitation from the host.');
      return;
    }
    if (!session) return;

    if (session.current_participants >= session.max_participants) {
      alert(t('sessionFullMsg'));
      return;
    }

    try {
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        alert(t('alreadyJoined'));
        return;
      }

      const { error: joinError } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          status: 'pending',
        });

      if (joinError) throw joinError;

      const { error: updateError } = await supabase
        .from('sessions')
        .update({ current_participants: session.current_participants + 1 })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      const message = session.join_policy === 'curated'         ? 'Request sent! The host will review your profile and decide.'         : t('joinedSuccessfully');      alert(message);
      await loadSessions();
    } catch (error: any) {
      console.error('Error joining session:', error);
      alert('Error: ' + error.message);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
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
      
      // Update local state
      setUserProfile({ ...userProfile, safety_waiver_accepted: true });
      setShowSafetyWaiver(false);
      
      // Now join the pending session
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
