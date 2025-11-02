'use client';

import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import { Calendar, MapPin, Clock, X, Check, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

export default function MatchesPage() {
  const { t } = useLanguage();
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
        .select('id')
        .eq('creator_id', user.id)
        .eq('status', 'active');

      if (sessError) throw sessError;

      if (!mySessions || mySessions.length === 0) {
        setJoinRequests([]);
        return;
      }

      const sessionIds = mySessions.map(s => s.id);

      const { data: participants, error: partError } = await supabase
        .from('session_participants')
        .select(`
          id,
          user_id,
          session_id,
          joined_at,
          status
        `)
        .in('session_id', sessionIds)
        .eq('status', 'confirmed')
        .order('joined_at', { ascending: false });

      if (partError) throw partError;

      if (!participants || participants.length === 0) {
        setJoinRequests([]);
        return;
      }

      const userIds = [...new Set(participants.map(p => p.user_id))];
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', userIds);

      if (userError) throw userError;

      const { data: sessions, error: sessDetailsError } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time, location')
        .in('id', sessionIds);

      if (sessDetailsError) throw sessDetailsError;

      const enrichedRequests = participants.map(p => ({
        ...p,
        user: users?.find(u => u.id === p.user_id),
        session: sessions?.find(s => s.id === p.session_id)
      }));

      setJoinRequests(enrichedRequests);
    } catch (error) {
      console.error('Error loading join requests:', error);
      setJoinRequests([]);
    }
  }

  async function loadTribeSessions() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: participations, error: partError } = await supabase
        .from('session_participants')
        .select('session_id, joined_at')
        .eq('user_id', user.id)
        .eq('status', 'confirmed');

      if (partError) throw partError;

      if (!participations || participations.length === 0) {
        setTribeSessions([]);
        return;
      }

      const sessionIds = participations.map(p => p.session_id);

      const { data: sessions, error: sessError } = await supabase
        .from('sessions')
        .select(`
          id,
          sport,
          date,
          start_time,
          location,
          description,
          creator_id,
          current_participants,
          max_participants
        `)
        .in('id', sessionIds)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true });

      if (sessError) throw sessError;

      if (!sessions || sessions.length === 0) {
        setTribeSessions([]);
        return;
      }

      const creatorIds = [...new Set(sessions.map(s => s.creator_id))];
      const { data: creators, error: creatorError } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', creatorIds);

      if (creatorError) throw creatorError;

      const enrichedSessions = sessions.map(s => ({
        ...s,
        creator: creators?.find(c => c.id === s.creator_id)
      }));

      setTribeSessions(enrichedSessions);
    } catch (error) {
      console.error('Error loading tribe sessions:', error);
      setTribeSessions([]);
    }
  }

  async function handleAcceptRequest(requestId: string) {
    alert('Accept functionality coming soon!');
  }

  async function handleRejectRequest(requestId: string) {
    alert('Reject functionality coming soon!');
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-tribe-darker flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-tribe-darker">
      <div className="bg-tribe-dark p-4 sticky top-0 z-10 border-b border-slate-700">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">{t('matchesTitle')}</h1>
          
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('requests')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                activeTab === 'requests'
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-tribe-darker text-gray-400 hover:text-white'
              }`}
            >
              {t('joinRequests')}
              {joinRequests.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {joinRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('tribe')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${
                activeTab === 'tribe'
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-tribe-darker text-gray-400 hover:text-white'
              }`}
            >
              {t('myTribe')}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-tribe-dark rounded-lg animate-pulse" />
            ))}
          </div>
        ) : activeTab === 'requests' ? (
          joinRequests.length === 0 ? (
            <div className="bg-tribe-dark rounded-lg p-8 text-center border border-slate-700">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">{t('noRequests')}</p>
              <p className="text-sm text-gray-500">{t('whenPeopleJoin')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {joinRequests.map((request) => (
                <RequestCard 
                  key={request.id} 
                  request={request}
                  onAccept={() => handleAcceptRequest(request.id)}
                  onReject={() => handleRejectRequest(request.id)}
                  t={t}
                />
              ))}
            </div>
          )
        ) : (
          tribeSessions.length === 0 ? (
            <div className="bg-tribe-dark rounded-lg p-8 text-center border border-slate-700">
              <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">{t('noTribeSessions')}</p>
              <p className="text-sm text-gray-500 mb-4">{t('joinToBuild')}</p>
              <Link href="/">
                <button className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition">
                  {t('findSessions')}
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {tribeSessions.map((session) => (
                <TribeCard key={session.id} session={session} />
              ))}
            </div>
          )
        )}
      </div>

      <BottomNav activeTab="matches" />
    </div>
  );
}

function RequestCard({ request, onAccept, onReject, t }: any) {
  return (
    <div className="bg-tribe-dark rounded-lg p-4 border border-slate-700">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-white font-semibold">{request.user?.name || 'Unknown User'}</p>
          <p className="text-sm text-gray-400 mt-1">
            {request.session?.sport}
          </p>
          <div className="flex items-center text-sm text-gray-500 mt-2">
            <Calendar className="w-3 h-3 mr-1" />
            {request.session?.date ? format(parseISO(request.session.date), 'MMM d') : 'Unknown'}
            <Clock className="w-3 h-3 ml-3 mr-1" />
            {request.session?.start_time ? format(parseISO(`2000-01-01T${request.session.start_time}`), 'h:mm a') : 'Unknown'}
          </div>
          <div className="flex items-center text-sm text-gray-500 mt-1">
            <MapPin className="w-3 h-3 mr-1" />
            {request.session?.location || 'Unknown location'}
          </div>
        </div>
        <div className="flex gap-2 ml-4">
          <button 
            onClick={onAccept}
            className="p-2 bg-tribe-green text-slate-900 rounded-lg hover:bg-lime-500 transition"
          >
            <Check className="w-5 h-5" />
          </button>
          <button 
            onClick={onReject}
            className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TribeCard({ session }: any) {
  const date = format(parseISO(session.date), 'EEE, MMM d');
  const time = format(parseISO(`2000-01-01T${session.start_time}`), 'h:mm a');

  const sportColors: Record<string, string> = {
    football: 'bg-gray-700',
    basketball: 'bg-blue-500',
    crossfit: 'bg-orange-500',
    bjj: 'bg-purple-600',
    running: 'bg-green-500',
    swimming: 'bg-cyan-500',
    tennis: 'bg-yellow-500',
    volleyball: 'bg-pink-500',
    soccer: 'bg-green-600',
  };

  const sportColor = sportColors[session.sport?.toLowerCase()] || 'bg-gray-600';

  return (
    <Link href={`/session/${session.id}`}>
      <div className="bg-tribe-dark rounded-lg p-4 hover:bg-slate-700 transition cursor-pointer border border-slate-700">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold text-white ${sportColor}`}>
              {session.sport}
            </span>
            <div className="flex items-center text-gray-300 mt-2">
              <Calendar className="w-4 h-4 mr-1" />
              <span className="text-sm">{date}</span>
              <Clock className="w-4 h-4 ml-3 mr-1" />
              <span className="text-sm">{time}</span>
            </div>
            <div className="flex items-start text-gray-400 mt-2">
              <MapPin className="w-4 h-4 mr-1 mt-0.5" />
              <span className="text-sm">{session.location}</span>
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="flex items-center text-gray-400">
              <Users className="w-4 h-4 mr-1" />
              <span className="text-sm">{session.current_participants}/{session.max_participants}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
