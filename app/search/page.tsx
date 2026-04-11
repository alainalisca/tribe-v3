'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { Search as SearchIcon, Loader, MapPin, Calendar, DollarSign, Users } from 'lucide-react';
import Image from 'next/image';
import BottomNav from '@/components/BottomNav';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface SearchResult {
  id: string;
  type: 'user' | 'community' | 'challenge' | 'session';
  [key: string]: unknown;
}

const TAB_KEYS = ['people', 'communities', 'challenges', 'sessions'] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default function SearchPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('people');
  const [results, setResults] = useState<Record<TabKey, SearchResult[]>>({
    people: [],
    communities: [],
    challenges: [],
    sessions: [],
  });
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const t = {
    en: {
      search: 'Search',
      people: 'People',
      communities: 'Communities',
      challenges: 'Challenges',
      sessions: 'Sessions',
      searchPlaceholder: 'Search...',
      noResults: 'No results found',
      loading: 'Loading...',
      follow: 'Connect',
      following: 'Connected',
      members: 'members',
      participants: 'participants',
    },
    es: {
      search: 'Buscar',
      people: 'Personas',
      communities: 'Comunidades',
      challenges: 'Retos',
      sessions: 'Sesiones',
      searchPlaceholder: 'Buscar...',
      noResults: 'No se encontraron resultados',
      loading: 'Cargando...',
      follow: 'Conectar',
      following: 'Conectado',
      members: 'miembros',
      participants: 'participantes',
    },
  };

  const strings = t[language as keyof typeof t] || t.en;

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      setCurrentUserId(user.id);
    };

    getCurrentUser();
  }, [supabase, router]);

  // Debounced search function
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!searchQuery.trim()) {
      setResults({
        people: [],
        communities: [],
        challenges: [],
        sessions: [],
      });
      return;
    }

    setLoading(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const query = `%${searchQuery}%`;

        // Search people
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, avatar_url, bio')
          .ilike('name', query)
          .limit(10);

        // Search communities
        const { data: communitiesData } = await supabase
          .from('communities')
          .select('id, name, sport, member_count')
          .eq('is_private', false)
          .or(`name.ilike.${query},sport.ilike.${query}`)
          .limit(10);

        // Search challenges
        const { data: challengesData } = await supabase
          .from('challenges')
          .select('id, title, challenge_type, participant_count, end_date')
          .eq('is_public', true)
          .ilike('title', query)
          .gte('end_date', new Date().toISOString())
          .limit(10);

        // Search sessions
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('id, sport, location, date, price_cents, currency, status, session_participants(id)')
          .or(`sport.ilike.${query},location.ilike.${query}`)
          .eq('status', 'scheduled')
          .limit(10);

        setResults({
          people: usersData?.map((u) => ({ ...u, type: 'user' })) || [],
          communities: communitiesData?.map((c) => ({ ...c, type: 'community' })) || [],
          challenges: challengesData?.map((c) => ({ ...c, type: 'challenge' })) || [],
          sessions: sessionsData?.map((s) => ({ ...s, type: 'session' })) || [],
        });
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce
  }, [searchQuery, supabase]);

  const tabResults = results[activeTab];

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-lg font-bold text-theme-primary">{strings.search}</h1>
        </div>
      </div>

      {/* Search Input */}
      <div className="pt-header sticky top-14 z-30 bg-theme-page border-b border-theme">
        <div className="max-w-2xl mx-auto p-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-theme-secondary" />
            <input
              autoFocus
              type="text"
              placeholder={strings.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-[#272D34] border border-stone-200 dark:border-gray-700 rounded-lg text-theme-primary placeholder-theme-secondary focus:outline-none focus:ring-2 focus:ring-tribe-green"
            />
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="sticky top-header z-30 bg-theme-card border-b border-theme overflow-x-auto">
        <div className="max-w-2xl mx-auto flex gap-6 px-4">
          {TAB_KEYS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 font-semibold text-sm border-b-2 transition whitespace-nowrap ${
                activeTab === tab
                  ? 'border-tribe-green text-tribe-green'
                  : 'border-transparent text-theme-secondary hover:text-theme-primary'
              }`}
            >
              {strings[tab as keyof typeof strings]}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="max-w-2xl mx-auto p-4">
        {loading && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader className="h-8 w-8 animate-spin text-tribe-green" />
            <p className="text-theme-secondary">{strings.loading}</p>
          </div>
        ) : !searchQuery ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <SearchIcon className="h-12 w-12 text-theme-secondary" />
            <p className="text-theme-secondary">{language === 'es' ? 'Comienza a buscar' : 'Start searching'}</p>
          </div>
        ) : tabResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <SearchIcon className="h-12 w-12 text-theme-secondary" />
            <p className="text-theme-secondary">{strings.noResults}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTab === 'people' &&
              tabResults.map((result: any) => (
                <PeopleResult
                  key={result.id}
                  user={result}
                  currentUserId={currentUserId}
                  language={language}
                  supabase={supabase}
                  onFollowChange={() => {}}
                />
              ))}

            {activeTab === 'communities' &&
              tabResults.map((result: any) => (
                <CommunityResult
                  key={result.id}
                  community={result}
                  language={language}
                  onSelect={() => router.push(`/communities/${result.id}`)}
                />
              ))}

            {activeTab === 'challenges' &&
              tabResults.map((result: any) => (
                <ChallengeResult
                  key={result.id}
                  challenge={result}
                  language={language}
                  onSelect={() => router.push(`/challenges/${result.id}`)}
                />
              ))}

            {activeTab === 'sessions' &&
              tabResults.map((result: any) => (
                <SessionResult
                  key={result.id}
                  session={result}
                  language={language}
                  onSelect={() => router.push(`/sessions/${result.id}`)}
                />
              ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

interface PeopleResultProps {
  user: any;
  currentUserId: string | null;
  language: string;
  supabase: any;
  onFollowChange: () => void;
}

function PeopleResult({ user, currentUserId, language, supabase, onFollowChange }: PeopleResultProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const checkFollow = async () => {
      if (!currentUserId || user.id === currentUserId) return;

      const { data } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', currentUserId)
        .eq('following_id', user.id)
        .single();

      setIsFollowing(!!data);
    };

    checkFollow();
  }, [currentUserId, user.id, supabase]);

  const handleToggleFollow = async () => {
    if (!currentUserId || user.id === currentUserId) return;

    setActionLoading(true);
    try {
      if (isFollowing) {
        await supabase.from('user_follows').delete().eq('follower_id', currentUserId).eq('following_id', user.id);
      } else {
        await supabase.from('user_follows').insert({
          follower_id: currentUserId,
          following_id: user.id,
        });
      }

      setIsFollowing(!isFollowing);
      onFollowChange();
    } catch (error) {
      console.error('Error toggling follow:', error);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#272D34] rounded-xl p-4 border border-stone-200 dark:border-gray-700 flex items-center justify-between">
      <div className="flex items-center gap-3 flex-1">
        {user.avatar_url && (
          <Image
            src={user.avatar_url}
            alt={user.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <p className="font-semibold text-theme-primary">{user.name}</p>
          {user.bio && <p className="text-xs text-theme-secondary line-clamp-1">{user.bio}</p>}
        </div>
      </div>

      {currentUserId && user.id !== currentUserId && (
        <button
          onClick={handleToggleFollow}
          disabled={actionLoading}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
            isFollowing
              ? 'bg-stone-100 dark:bg-[#3D4349] text-theme-primary hover:bg-red-100'
              : 'bg-tribe-green text-slate-900 hover:bg-[#8FD642]'
          } disabled:opacity-50`}
        >
          {language === 'es' ? (isFollowing ? 'Conectado' : 'Conectar') : isFollowing ? 'Connected' : 'Connect'}
        </button>
      )}
    </div>
  );
}

interface CommunityResultProps {
  community: any;
  language: string;
  onSelect: () => void;
}

function CommunityResult({ community, language, onSelect }: CommunityResultProps) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white dark:bg-[#272D34] rounded-xl p-4 border border-stone-200 dark:border-gray-700 hover:shadow-lg transition"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="font-semibold text-theme-primary">{community.name}</p>
          {community.sport && (
            <p className="text-sm text-theme-secondary">
              {sportTranslations[community.sport as string]?.[language as 'en' | 'es'] || community.sport}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Users className="h-4 w-4 text-theme-secondary" />
            <span className="text-xs text-theme-secondary">
              {community.member_count} {language === 'es' ? 'miembros' : 'members'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

interface ChallengeResultProps {
  challenge: any;
  language: string;
  onSelect: () => void;
}

function ChallengeResult({ challenge, language, onSelect }: ChallengeResultProps) {
  const daysLeft = Math.ceil((new Date(challenge.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white dark:bg-[#272D34] rounded-xl p-4 border border-stone-200 dark:border-gray-700 hover:shadow-lg transition"
    >
      <div>
        <p className="font-semibold text-theme-primary">{challenge.title}</p>
        <div className="flex items-center gap-4 mt-2 text-sm text-theme-secondary">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>
              {challenge.participant_count} {language === 'es' ? 'participantes' : 'participants'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>
              {daysLeft} {language === 'es' ? 'días' : 'days'}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

interface SessionResultProps {
  session: any;
  language: string;
  onSelect: () => void;
}

function SessionResult({ session, language, onSelect }: SessionResultProps) {
  const sessionDate = new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US');

  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-white dark:bg-[#272D34] rounded-xl p-4 border border-stone-200 dark:border-gray-700 hover:shadow-lg transition"
    >
      <div>
        <p className="font-semibold text-theme-primary">
          {sportTranslations[session.sport as string]?.[language as 'en' | 'es'] || session.sport}
        </p>
        <div className="space-y-1 mt-2 text-sm text-theme-secondary">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{sessionDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>{session.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span>{formatPrice(session.price_cents, (session.currency || 'USD') as Currency)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
