'use client';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { Calendar, MapPin, Clock, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

export default function MatchesPage() {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'requests' | 'tribe'>('tribe');
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const [tribeSessions, setTribeSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, activeTab]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'requests') {
        await loadJoinRequests();
      } else {
        await loadTribeSessions();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadJoinRequests() {
    try {
      const { data: mySessions, error: sessError } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location')
        .eq('creator_id', user.id)
        .eq('status', 'active');

      if (sessError) throw sessError;

      if (!mySessions || mySessions.length === 0) {
        setJoinRequests([]);
        return;
      }

      const sessionIds = mySessions.map(s => s.id);

      const { data: participants } = await supabase
        .from('session_participants')
        .select(`
          id, 
          user_id, 
          session_id, 
          joined_at, 
          status,
          user:users!session_participants_user_id_fkey(id, name, avatar_url)
        `)
        .in('session_id', sessionIds)
        .eq('status', 'confirmed')
        .order('joined_at', { ascending: false });

      const requestsWithSession = (participants || []).map(p => ({
        ...p,
        session: mySessions.find(s => s.id === p.session_id)
      }));

      setJoinRequests(requestsWithSession);
    } catch (error) {
      console.error('Error loading join requests:', error);
      setJoinRequests([]);
    }
  }

  async function loadTribeSessions() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: participations } = await supabase
        .from('session_participants')
        .select('session_id, joined_at')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');

      if (!participations || participations.length === 0) {
        setTribeSessions([]);
        return;
      }

      const sessionIds = participations.map(p => p.session_id);

      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location, creator_id, current_participants, max_participants')
        .in('id', sessionIds)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true });

      setTribeSessions(sessions || []);
    } catch (error) {
      console.error('Error loading tribe sessions:', error);
      setTribeSessions([]);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <p className="text-stone-900 dark:text-gray-100"></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 bg-stone-50 dark:bg-[#52575D]">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 sticky top-0 z-10 border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-[#272D34] dark:text-white mb-4">{t("matches")}</h1>
          
          <div className="flex gap-3">
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
                activeTab === 'requests'
                  ? 'bg-stone-300 dark:bg-[#404549] text-[#272D34] dark:text-white'
                  : 'bg-white dark:bg-[#6B7178] text-stone-600 dark:text-gray-300'
              }`}
            >
              {t("joinRequests")} {joinRequests.length > 0 && `(${joinRequests.length})`}
            </button>
            <button
              onClick={() => setActiveTab('tribe')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition ${
                activeTab === 'tribe'
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-white dark:bg-[#6B7178] text-stone-600 dark:text-gray-300'
              }`}
            >
              {t("myTribe")}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <p className="text-center text-stone-600 dark:text-gray-300"></p>
        ) : activeTab === 'requests' ? (
          joinRequests.length === 0 ? (
            <p className="text-center text-stone-600 dark:text-gray-300 mt-8">{t('noJoinRequests')}</p>
          ) : (
            <div className="space-y-3">
              {joinRequests.map((request) => (
                <Link key={request.id} href={`/session/${request.session_id}`}>
                  <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 border border-stone-200 dark:border-[#52575D] hover:bg-stone-50 dark:hover:bg-[#52575D] transition cursor-pointer">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-tribe-green flex items-center justify-center overflow-hidden">
                        {request.user?.avatar_url ? (
                          <img src={request.user.avatar_url} alt={request.user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-slate-900">
                            {request.user?.name?.charAt(0).toUpperCase() || '?'}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-[#272D34] dark:text-white font-semibold">
                          {request.user?.name || t('newJoinRequest')}
                        </p>
                        <p className="text-sm text-stone-600 dark:text-gray-300">
                          {t('userWantsToJoin')}
                        </p>
                      </div>
                    </div>
                    {request.session && (
                      <div className="mt-2 pt-2 border-t border-stone-200 dark:border-[#52575D] text-sm text-stone-600 dark:text-gray-300">
                        <span className="font-medium">{language === 'es' ? (sportTranslations[request.session.sport]?.es || request.session.sport) : request.session.sport}</span> • {request.session.location}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : (
          tribeSessions.length === 0 ? (
            <p className="text-center text-stone-600 dark:text-gray-300 mt-8">{t('noSessions')}</p>
          ) : (
            <div className="space-y-3">
              {tribeSessions.map((session) => (
                <Link key={session.id} href={`/session/${session.id}`}>
                  <div className="bg-white dark:bg-[#6B7178] rounded-xl p-4 border border-stone-200 dark:border-[#52575D] hover:bg-stone-50 dark:hover:bg-[#52575D] transition cursor-pointer">
                    <div className="flex items-start justify-between mb-3">
                      <span className="px-3 py-1 bg-tribe-green text-slate-900 rounded-full text-sm font-medium">
                        {language === 'es' ? (sportTranslations[session.sport]?.es || session.sport) : session.sport}
                      </span>
                      <div className="flex items-center gap-1 text-stone-600 dark:text-gray-300 text-sm">
                        <Users className="w-4 h-4" />
                        <span>{session.current_participants}/{session.max_participants}</span>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-stone-600 dark:text-gray-300">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{format(parseISO(session.date), 'EEE, MMM d', { locale: language === 'es' ? es : undefined })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{session.start_time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        <span>{session.location}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
      </div>

      <BottomNav />
    </div>
  );
}
