'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchUserChallenges, fetchPublicChallenges, isInChallenge, ChallengeWithCreator } from '@/lib/dal/challenges';
import { sportTranslations } from '@/lib/translations';
import { Plus, Search, Calendar, Users, Zap, Loader } from 'lucide-react';
import Image from 'next/image';
import BottomNav from '@/components/BottomNav';

const CHALLENGE_TYPE_LABELS = {
  session_count: 'Session Count',
  streak: 'Streak',
  sport_variety: 'Sport Variety',
  custom: 'Custom',
};

const CHALLENGE_TYPE_LABELS_ES = {
  session_count: 'Contador de sesiones',
  streak: 'Racha',
  sport_variety: 'Variedad de deportes',
  custom: 'Personalizado',
};

export default function ChallengesPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userChallenges, setUserChallenges] = useState<(ChallengeWithCreator & { userProgress?: number })[]>([]);
  const [publicChallenges, setPublicChallenges] = useState<ChallengeWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState<string | undefined>();
  const [userChallengeIds, setUserChallengeIds] = useState<Set<string>>(new Set());

  const t = {
    en: {
      myChallenges: 'My Challenges',
      discover: 'Discover',
      newChallenge: 'New Challenge',
      search: 'Search challenges...',
      filterSport: 'All Sports',
      daysLeft: (days: number) => `${days} days left`,
      noChallenges: 'No challenges yet',
      noDiscover: 'No challenges found',
      progress: 'Progress',
      join: 'Join',
      joined: 'Joined',
      participants: 'athletes',
      loading: 'Loading...',
    },
    es: {
      myChallenges: 'Mis Retos',
      discover: 'Descubrir',
      newChallenge: 'Nuevo Reto',
      search: 'Buscar retos...',
      filterSport: 'Todos los deportes',
      daysLeft: (days: number) => `${days} días restantes`,
      noChallenges: 'Sin retos aún',
      noDiscover: 'No se encontraron retos',
      progress: 'Progreso',
      join: 'Unirse',
      joined: 'Unido',
      participants: 'atletas',
      loading: 'Cargando...',
    },
  };

  const strings = t[language as keyof typeof t] || t.en;
  const typeLabels = language === 'es' ? CHALLENGE_TYPE_LABELS_ES : CHALLENGE_TYPE_LABELS;

  // Get current user and load challenges
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/auth/login');
          return;
        }

        setCurrentUserId(user.id);

        // Load user's challenges
        const userChallengesResult = await fetchUserChallenges(supabase, user.id);
        if (userChallengesResult.success && userChallengesResult.data) {
          setUserChallenges(userChallengesResult.data);
          const ids = new Set(userChallengesResult.data.map((c) => c.id));
          setUserChallengeIds(ids);
        }

        // Load public challenges
        const publicChallengesResult = await fetchPublicChallenges(supabase);
        if (publicChallengesResult.success && publicChallengesResult.data) {
          setPublicChallenges(publicChallengesResult.data);
        }
      } catch (error) {
        console.error('Error loading challenges:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [supabase, router]);

  const handleSearch = async (query: string, sport?: string) => {
    setLoading(true);
    try {
      const result = await fetchPublicChallenges(supabase, {
        search: query || undefined,
        sport: sport || undefined,
      });

      if (result.success && result.data) {
        setPublicChallenges(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSportFilter = (sport: string) => {
    setSelectedSport(sport === '' ? undefined : sport);
    handleSearch(searchQuery, sport === '' ? undefined : sport);
  };

  const daysUntilEnd = (endDate: string) => {
    const now = new Date();
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  // Filter public challenges to exclude already joined ones if needed
  const filteredPublic = publicChallenges.filter((c) => !userChallengeIds.has(c.id));

  const sports = Object.keys(sportTranslations.en || {});

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <h1 className="text-lg font-bold text-theme-primary">{strings.myChallenges}</h1>
          <button
            onClick={() => router.push('/challenges/create')}
            className="flex items-center gap-2 bg-tribe-green text-slate-900 font-semibold rounded-lg px-4 py-2 hover:bg-[#8FD642] transition"
          >
            <Plus className="h-4 w-4" />
            {strings.newChallenge}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader className="h-8 w-8 animate-spin text-tribe-green" />
            <p className="text-theme-secondary">{strings.loading}</p>
          </div>
        ) : (
          <>
            {/* My Challenges Section */}
            <section>
              <h2 className="text-lg font-bold text-theme-primary mb-4">{strings.myChallenges}</h2>
              {userChallenges.length === 0 ? (
                <div className="bg-white dark:bg-[#272D34] rounded-2xl p-8 text-center border border-stone-200 dark:border-gray-700">
                  <Zap className="h-12 w-12 text-theme-secondary mx-auto mb-3" />
                  <p className="text-theme-secondary">{strings.noChallenges}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {userChallenges.map((challenge) => (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      isJoined={true}
                      progress={challenge.userProgress}
                      language={language}
                      onCardClick={() => router.push(`/challenges/${challenge.id}`)}
                      typeLabels={typeLabels}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Discover Challenges Section */}
            <section>
              <h2 className="text-lg font-bold text-theme-primary mb-4">{strings.discover}</h2>

              {/* Search and Filter */}
              <div className="space-y-3 mb-4">
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-theme-secondary" />
                  <input
                    type="text"
                    placeholder={strings.search}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      handleSearch(e.target.value, selectedSport);
                    }}
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-[#272D34] border border-stone-200 dark:border-gray-700 rounded-lg text-theme-primary placeholder-theme-secondary focus:outline-none focus:ring-2 focus:ring-tribe-green"
                  />
                </div>

                {/* Sport Filter */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <button
                    onClick={() => handleSportFilter('')}
                    className={`px-4 py-2 rounded-full whitespace-nowrap font-semibold transition ${
                      !selectedSport
                        ? 'bg-tribe-green text-slate-900'
                        : 'bg-stone-100 dark:bg-[#3D4349] text-theme-primary hover:bg-tribe-green/20'
                    }`}
                  >
                    {strings.filterSport}
                  </button>
                  {sports.slice(0, 8).map((sport) => (
                    <button
                      key={sport}
                      onClick={() => handleSportFilter(sport)}
                      className={`px-4 py-2 rounded-full whitespace-nowrap font-semibold transition ${
                        selectedSport === sport
                          ? 'bg-tribe-green text-slate-900'
                          : 'bg-stone-100 dark:bg-[#3D4349] text-theme-primary hover:bg-tribe-green/20'
                      }`}
                    >
                      {(sportTranslations as Record<string, Record<string, string>>)[language === 'es' ? 'es' : 'en']?.[
                        sport
                      ] || sport}
                    </button>
                  ))}
                </div>
              </div>

              {/* Challenges Grid */}
              {filteredPublic.length === 0 ? (
                <div className="bg-white dark:bg-[#272D34] rounded-2xl p-8 text-center border border-stone-200 dark:border-gray-700">
                  <Search className="h-12 w-12 text-theme-secondary mx-auto mb-3" />
                  <p className="text-theme-secondary">{strings.noDiscover}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredPublic.map((challenge) => (
                    <ChallengeCard
                      key={challenge.id}
                      challenge={challenge}
                      isJoined={false}
                      language={language}
                      onCardClick={() => router.push(`/challenges/${challenge.id}`)}
                      typeLabels={typeLabels}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

interface ChallengeCardProps {
  challenge: ChallengeWithCreator;
  isJoined?: boolean;
  progress?: number;
  language: 'en' | 'es';
  onCardClick: () => void;
  typeLabels: Record<string, string>;
}

function ChallengeCard({
  challenge,
  isJoined = false,
  progress = 0,
  language,
  onCardClick,
  typeLabels,
}: ChallengeCardProps) {
  const daysLeft = Math.ceil((new Date(challenge.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));

  const progressPercent = challenge.target_value > 0 ? Math.min((progress / challenge.target_value) * 100, 100) : 0;

  const strings = {
    en: { daysLeft: `${daysLeft} days left`, participants: 'athletes' },
    es: { daysLeft: `${daysLeft} días restantes`, participants: 'atletas' },
  };

  const s = strings[language] || strings.en;

  return (
    <button onClick={onCardClick} className="text-left transition hover:shadow-lg">
      <div className="bg-white dark:bg-[#272D34] rounded-2xl overflow-hidden border border-stone-200 dark:border-gray-700">
        {/* Cover Image or Gradient */}
        <div className="h-40 bg-gradient-to-br from-tribe-green to-[#8FD642] relative overflow-hidden">
          {challenge.cover_image_url && (
            <Image src={challenge.cover_image_url} alt={challenge.title} fill className="object-cover" />
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <span className="bg-slate-900/80 text-tribe-green text-xs font-semibold px-2 py-1 rounded-full">
              {typeLabels[challenge.challenge_type] || challenge.challenge_type}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-theme-primary text-lg line-clamp-2">{challenge.title}</h3>
            {challenge.sport && (
              <p className="text-sm text-theme-secondary">
                {(sportTranslations as Record<string, Record<string, string>>)[language === 'es' ? 'es' : 'en']?.[
                  challenge.sport
                ] || challenge.sport}
              </p>
            )}
          </div>

          {/* Progress Bar (if joined) */}
          {isJoined && (
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-theme-secondary">
                  {progress} / {challenge.target_value}
                </span>
                <span className="text-tribe-green font-semibold">{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full bg-stone-200 dark:bg-[#3D4349] rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-tribe-green transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-theme-secondary">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              <span>
                {challenge.participant_count} {s.participants}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{s.daysLeft}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
