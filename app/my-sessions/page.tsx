'use client';
import { formatTime12Hour } from "@/lib/utils";

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin, Users, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

export default function MySessionsPage() {
  const [user, setUser] = useState<any>(null);
  const [hostingSessions, setHostingSessions] = useState<any[]>([]);
  const [joinedSessions, setJoinedSessions] = useState<any[]>([]);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setUser(user);
    await loadSessions(user.id);
  }

  async function loadSessions(userId: string) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Load sessions I'm hosting (upcoming)
      const { data: hosting } = await supabase
        .from('sessions')
        .select(`
          *,
          participants:session_participants(user_id, status)
        `)
        .eq('creator_id', userId)
        .gte('date', today)
        .eq('status', 'active')
        .order('date', { ascending: true });

      // Load sessions I've joined (upcoming)
      const { data: joined } = await supabase
        .from('session_participants')
        .select(`
          session:sessions(
            *,
            creator:users!sessions_creator_id_fkey(name, avatar_url)
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'confirmed');

      // Filter joined sessions to only upcoming ones
      const upcomingJoined = joined?.filter(j => {
        const session = j.session as any;
        if (!session) return false;
        return new Date(session.date) >= new Date(today) && session.creator_id !== userId;
      }).map(j => j.session as any) || [];

      // Load past sessions (both hosted and joined)
      const { data: pastHosted } = await supabase
        .from('sessions')
        .select('*')
        .eq('creator_id', userId)
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(20);

      const pastJoinedData = joined?.filter(j => {
        const session = j.session as any;
        if (!session) return false;
        return new Date(session.date) < new Date(today);
      }).map(j => ({ ...(j.session as any), wasParticipant: true })) || [];

      // Combine and dedupe past sessions
      const allPast = [...(pastHosted || []), ...pastJoinedData];
      const uniquePast = allPast.reduce((acc: any[], curr) => {
        if (!acc.find(s => s.id === curr.id)) {
          acc.push(curr);
        }
        return acc;
      }, []);
      uniquePast.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setHostingSessions(hosting || []);
      setJoinedSessions(upcomingJoined);
      setPastSessions(uniquePast.slice(0, 20));
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  }

  const txt = language === 'es' ? {
    mySessions: 'Mis Sesiones',
    upcoming: 'Próximas',
    past: 'Historial',
    hosting: 'Organizando',
    joined: 'Unido',
    noUpcoming: 'No tienes sesiones próximas',
    noPast: 'No tienes sesiones pasadas',
    browseHome: 'Explora sesiones para unirte',
    createSession: 'Crear Sesión',
    browseSessions: 'Ver Sesiones',
    spots: 'lugares',
    ended: 'Terminada',
  } : {
    mySessions: 'My Sessions',
    upcoming: 'Upcoming',
    past: 'History',
    hosting: 'Hosting',
    joined: 'Joined',
    noUpcoming: 'No upcoming sessions',
    noPast: 'No past sessions',
    browseHome: 'Browse sessions to join',
    createSession: 'Create Session',
    browseSessions: 'Browse Sessions',
    spots: 'spots',
    ended: 'Ended',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <div className="animate-pulse text-stone-500 dark:text-gray-400">
          <div className="w-8 h-8 border-4 border-tribe-green border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        </div>
      </div>
    );
  }

  const getSportName = (sport: string) => {
    return language === 'es' ? (sportTranslations[sport]?.es || sport) : sport;
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] pb-32 safe-area-top">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
            {txt.mySessions}
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto flex">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`flex-1 py-3 text-sm font-semibold transition ${
              activeTab === 'upcoming'
                ? 'text-tribe-green border-b-2 border-tribe-green'
                : 'text-stone-600 dark:text-gray-400'
            }`}
          >
            {txt.upcoming} ({hostingSessions.length + joinedSessions.length})
          </button>
          <button
            onClick={() => setActiveTab('past')}
            className={`flex-1 py-3 text-sm font-semibold transition ${
              activeTab === 'past'
                ? 'text-tribe-green border-b-2 border-tribe-green'
                : 'text-stone-600 dark:text-gray-400'
            }`}
          >
            {txt.past} ({pastSessions.length})
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {activeTab === 'upcoming' ? (
          <>
            {hostingSessions.length === 0 && joinedSessions.length === 0 ? (
              <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
                <Calendar className="w-16 h-16 text-stone-300 dark:text-gray-600 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">
                  {txt.noUpcoming}
                </h2>
                <p className="text-stone-600 dark:text-gray-300 mb-6">
                  {txt.browseHome}
                </p>
                <div className="flex gap-3 justify-center">
                  <Link href="/create">
                    <button className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">
                      {txt.createSession}
                    </button>
                  </Link>
                  <Link href="/">
                    <button className="px-6 py-3 border border-stone-300 dark:border-[#52575D] text-stone-900 dark:text-white font-semibold rounded-lg hover:bg-stone-100 dark:hover:bg-[#52575D] transition">
                      {txt.browseSessions}
                    </button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Hosting Section */}
                {hostingSessions.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-stone-600 dark:text-gray-400 uppercase tracking-wide mb-3">
                      {txt.hosting} ({hostingSessions.length})
                    </h2>
                    <div className="space-y-3">
                      {hostingSessions.map((session) => (
                        <SessionCard key={session.id} session={session} getSportName={getSportName} txt={txt} language={language} isHost />
                      ))}
                    </div>
                  </div>
                )}

                {/* Joined Section */}
                {joinedSessions.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-stone-600 dark:text-gray-400 uppercase tracking-wide mb-3">
                      {txt.joined} ({joinedSessions.length})
                    </h2>
                    <div className="space-y-3">
                      {joinedSessions.map((session) => (
                        <SessionCard key={session.id} session={session} getSportName={getSportName} txt={txt} language={language} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {pastSessions.length === 0 ? (
              <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
                <Clock className="w-16 h-16 text-stone-300 dark:text-gray-600 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-stone-900 dark:text-white mb-2">
                  {txt.noPast}
                </h2>
              </div>
            ) : (
              <div className="space-y-3">
                {pastSessions.map((session) => (
                  <SessionCard key={session.id} session={session} getSportName={getSportName} txt={txt} language={language} isPast />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function SessionCard({ session, getSportName, txt, language, isHost = false, isPast = false }: any) {
  return (
    <Link href={`/session/${session.id}`}>
      <div className={`bg-white dark:bg-[#6B7178] rounded-xl p-4 border border-stone-200 dark:border-[#52575D] hover:shadow-md transition cursor-pointer ${isPast ? 'opacity-75' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                isPast
                  ? 'bg-stone-200 dark:bg-[#52575D] text-stone-600 dark:text-gray-400'
                  : 'bg-tribe-green text-slate-900'
              }`}>
                {getSportName(session.sport)}
              </span>
              {isHost && (
                <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full">
                  {txt.hosting}
                </span>
              )}
              {isPast && (
                <span className="text-xs text-stone-500 dark:text-gray-400">
                  {txt.ended}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                <Calendar className="w-4 h-4 mr-2 text-stone-400" />
                {new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })} • {formatTime12Hour(session.start_time)}
              </div>
              <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                <MapPin className="w-4 h-4 mr-2 text-stone-400" />
                <span className="truncate">{session.location}</span>
              </div>
              {!isPast && (
                <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                  <Users className="w-4 h-4 mr-2 text-stone-400" />
                  {session.current_participants || 1}/{session.max_participants} {txt.spots}
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-stone-400 flex-shrink-0 ml-2" />
        </div>
      </div>
    </Link>
  );
}
