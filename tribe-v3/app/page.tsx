'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { Settings, Plus, Search, Filter, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import SessionCard from '@/components/SessionCard';
import BottomNav from '@/components/BottomNav';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Session {
  id: string;
  sport: string;
  date: string;
  start_time: string;
  location: string;
  description: string;
  max_participants: number;
  current_participants: number;
  creator_id: string;
  creator: {
    name: string;
    avatar_url: string;
  };
  participants: Array<{
    user_id: string;
    user: {
      name: string;
      avatar_url: string;
    };
  }>;
}

export default function HomePage() {
  const t = useTranslations();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const supabase = createClient();

  const sports = [
    'All',
    'Running',
    'CrossFit',
    'Basketball',
    'Soccer',
    'Tennis',
    'Swimming',
    'BJJ',
    'Volleyball',
    'Football',
    'Cycling',
    'Boxing',
    'Yoga',
    'Pilates',
    'Dance',
    'Climbing',
    'Surfing',
    'Skating',
    'Golf',
    'Baseball',
    'Hockey',
    'Rugby'
  ];

  useEffect(() => {
    checkUser();
    loadSessions();
  }, []);

  useEffect(() => {
    filterSessions();
  }, [sessions, searchQuery, selectedSport]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }
    setUser(user);
  }

  async function loadSessions() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          creator:users!creator_id(name, avatar_url),
          participants:session_participants(
            user_id,
            status,
            user:users(name, avatar_url)
          )
        `)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(50);

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

    // Filter by sport
    if (selectedSport !== 'all') {
      filtered = filtered.filter(
        (s) => s.sport.toLowerCase() === selectedSport.toLowerCase()
      );
    }

    // Filter by search query (location or sport)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.location.toLowerCase().includes(query) ||
          s.sport.toLowerCase().includes(query)
      );
    }

    setFilteredSessions(filtered);
  }

  function clearFilters() {
    setSearchQuery('');
    setSelectedSport('all');
    setShowFilters(false);
  }

  async function handleJoinSession(sessionId: string) {
    if (!user) return;

    try {
      const { error } = await supabase.from('session_participants').insert({
        session_id: sessionId,
        user_id: user.id,
        status: 'pending',
      });

      if (error) throw error;

      // Reload sessions to update UI
      loadSessions();
    } catch (error) {
      console.error('Error joining session:', error);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-tribe-darker flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tribe-darker pb-20">
      {/* Header with Search */}
      <div className="bg-tribe-dark sticky top-0 z-10 border-b border-slate-700">
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-white">Tribe</h1>
            <Link href="/profile">
              <Settings className="w-6 h-6 text-gray-400 hover:text-white transition" />
            </Link>
          </div>

          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by location or sport..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-tribe-darker text-white rounded-lg border border-slate-700 focus:border-tribe-green focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-5 h-5 text-gray-400 hover:text-white" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-3 rounded-lg transition ${
                showFilters || selectedSport !== 'all'
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-tribe-darker text-gray-400 hover:text-white border border-slate-700'
              }`}
            >
              <Filter className="w-5 h-5" />
            </button>
          </div>

          {/* Results Count */}
          <div className="mt-3 text-sm text-gray-400">
            {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
          </div>

          {/* Sport Filter Pills */}
          {showFilters && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700 mt-3">
              {sports.map((sport) => (
                <button
                  key={sport}
                  onClick={() => setSelectedSport(sport.toLowerCase())}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    selectedSport === sport.toLowerCase()
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-tribe-darker text-gray-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {sport}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-tribe-dark rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-12">
            {sessions.length === 0 ? (
              <>
                <p className="text-gray-400 mb-4">No active sessions yet</p>
                <Link
                  href="/create"
                  className="inline-flex items-center px-6 py-3 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:bg-lime-500 transition"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Session
                </Link>
              </>
            ) : (
              <>
                <p className="text-gray-400 mb-2">No sessions match your filters</p>
                <button
                  onClick={clearFilters}
                  className="text-tribe-green hover:underline"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSessions.map((session) => (
              <SessionCard 
                key={session.id} 
                session={session}
                onJoin={() => handleJoinSession(session.id)}
                currentUserId={user?.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      {user && (
        <Link
          href="/create"
          className="fixed bottom-24 right-6 w-14 h-14 bg-tribe-green rounded-full flex items-center justify-center shadow-lg hover:bg-lime-500 transition z-20"
        >
          <Plus className="w-6 h-6 text-slate-900" />
        </Link>
      )}

      <BottomNav activeTab="home" />
    </div>
  );
}
