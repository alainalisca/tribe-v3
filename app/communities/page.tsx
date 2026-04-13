'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import CommunityCard from '@/components/CommunityCard';
import CommunityNewsTab from '@/components/CommunityNewsTab';
import CommunityBulletinTab from '@/components/CommunityBulletinTab';
import { SkeletonCard } from '@/components/Skeleton';
import { fetchCommunities, fetchUserCommunities, type CommunityWithCreator } from '@/lib/dal/communities';
import { sportTranslations } from '@/lib/translations';
import { Search, Plus, Dumbbell, ChevronRight } from 'lucide-react';

function getTranslations(language: 'en' | 'es') {
  return {
    title: language === 'es' ? 'Comunidades' : 'Communities',
    myCommunities: language === 'es' ? 'Mis Comunidades' : 'My Communities',
    discover: language === 'es' ? 'Descubre' : 'Discover',
    search: language === 'es' ? 'Buscar comunidades...' : 'Search communities...',
    create: language === 'es' ? 'Crear Comunidad' : 'Create Community',
    noCommunities: language === 'es' ? 'No hay comunidades' : 'No communities',
    noCommunitiesDesc:
      language === 'es' ? 'Únete a una comunidad o crea una nueva' : 'Join a community or create a new one',
    loading: language === 'es' ? 'Cargando...' : 'Loading...',
    all: language === 'es' ? 'Todos' : 'All',
    tabCommunities: language === 'es' ? 'Comunidades' : 'Communities',
    tabNews: language === 'es' ? 'Noticias' : 'News',
    tabBulletin: language === 'es' ? 'Tablon' : 'Bulletin',
  };
}

export default function CommunitiesPage() {
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const [activeTab, setActiveTab] = useState<'communities' | 'news' | 'bulletin'>('communities');
  const [userCommunities, setUserCommunities] = useState<CommunityWithCreator[]>([]);
  const [allCommunities, setAllCommunities] = useState<CommunityWithCreator[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<CommunityWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState('All');
  const [showAllSports, setShowAllSports] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        await fetchInitialData(user.id);
      }
    }
    getUser();
  }, []);

  useEffect(() => {
    filterCommunities();
  }, [searchQuery, selectedSport, allCommunities]);

  async function fetchInitialData(uid: string) {
    try {
      setLoading(true);
      const [userResult, allResult] = await Promise.all([
        fetchUserCommunities(supabase, uid),
        fetchCommunities(supabase, { limit: 100 }),
      ]);
      if (userResult.success) setUserCommunities(userResult.data || []);
      if (allResult.success) setAllCommunities(allResult.data || []);
    } catch (error) {
      logError(error, { action: 'fetchInitialData' });
    } finally {
      setLoading(false);
    }
  }

  function filterCommunities() {
    let results = [...allCommunities];
    if (selectedSport !== 'All') results = results.filter((c) => c.sport === selectedSport);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q) ?? false)
      );
    }
    setFilteredCommunities(results);
  }

  const sportOptions = ['All', ...Object.keys(sportTranslations).filter((s) => s !== 'All')];
  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h1 className="text-2xl font-bold text-theme-primary">{t.title}</h1>
            {activeTab === 'communities' && (
              <Link
                href="/communities/create"
                className="flex items-center gap-2 px-4 py-2 bg-tribe-green text-slate-900 rounded-lg hover:bg-tribe-green transition font-medium"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline text-sm">{t.create}</span>
              </Link>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-stone-100 dark:bg-tribe-dark rounded-lg p-1">
            <button
              onClick={() => setActiveTab('communities')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                activeTab === 'communities'
                  ? 'bg-white dark:bg-tribe-mid text-theme-primary shadow-sm'
                  : 'text-stone-500 dark:text-gray-400 hover:text-theme-primary'
              }`}
            >
              {t.tabCommunities}
            </button>
            <button
              onClick={() => setActiveTab('news')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                activeTab === 'news'
                  ? 'bg-white dark:bg-tribe-mid text-theme-primary shadow-sm'
                  : 'text-stone-500 dark:text-gray-400 hover:text-theme-primary'
              }`}
            >
              {t.tabNews}
            </button>
            <button
              onClick={() => setActiveTab('bulletin')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                activeTab === 'bulletin'
                  ? 'bg-white dark:bg-tribe-mid text-theme-primary shadow-sm'
                  : 'text-stone-500 dark:text-gray-400 hover:text-theme-primary'
              }`}
            >
              {t.tabBulletin}
            </button>
          </div>

          {/* Search bar — communities tab only */}
          {activeTab === 'communities' ? (
            <div className="mt-3 pb-4">
              <div className="relative flex items-center">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t.search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent"
                />
              </div>
            </div>
          ) : (
            <div className="h-3" />
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {activeTab === 'bulletin' ? (
          <CommunityBulletinTab />
        ) : activeTab === 'news' ? (
          <CommunityNewsTab />
        ) : (
          <CommunitiesTabContent
            loading={loading}
            language={language}
            t={t}
            userCommunities={userCommunities}
            filteredCommunities={filteredCommunities}
            sportOptions={sportOptions}
            selectedSport={selectedSport}
            setSelectedSport={setSelectedSport}
            showAllSports={showAllSports}
            setShowAllSports={setShowAllSports}
          />
        )}
      </div>

      <BottomNav />
    </div>
  );
}

/** Extracted communities tab content to keep the page under 300 lines */
function CommunitiesTabContent({
  loading,
  language,
  t,
  userCommunities,
  filteredCommunities,
  sportOptions,
  selectedSport,
  setSelectedSport,
  showAllSports,
  setShowAllSports,
}: {
  loading: boolean;
  language: 'en' | 'es';
  t: ReturnType<typeof getTranslations>;
  userCommunities: CommunityWithCreator[];
  filteredCommunities: CommunityWithCreator[];
  sportOptions: string[];
  selectedSport: string;
  setSelectedSport: (sport: string) => void;
  showAllSports: boolean;
  setShowAllSports: (show: boolean) => void;
}) {
  return (
    <div className="space-y-8">
      {/* Train with an Instructor Banner */}
      <Link
        href="/instructors"
        className="block rounded-xl border-2 border-tribe-green/40 bg-gradient-to-r from-tribe-green/10 to-tribe-green/5 p-4 hover:border-tribe-green transition"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-tribe-green/20 shrink-0">
            <Dumbbell className="w-5 h-5 text-tribe-green" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-theme-primary text-sm">
              {language === 'es' ? 'Entrena con un Instructor' : 'Train with an Instructor'}
            </h3>
            <p className="text-xs text-theme-secondary truncate">
              {language === 'es'
                ? 'Encuentra instructores certificados cerca de ti'
                : 'Find certified instructors near you'}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-tribe-green shrink-0" />
        </div>
      </Link>

      {!loading && userCommunities.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-theme-primary mb-3">{t.myCommunities}</h2>
          <div className="flex overflow-x-auto gap-4 pb-2 -mx-4 px-4">
            {userCommunities.map((community) => (
              <div key={community.id} className="flex-shrink-0 w-64">
                <CommunityCard community={community} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-stone-500 dark:text-gray-400">
          {language === 'es' ? 'Filtrar por deporte' : 'Filter by sport'}
        </h3>
        <div className="flex flex-wrap gap-2">
          {(showAllSports ? sportOptions : sportOptions.slice(0, 8)).map((sport) => {
            const sportName = sport === 'All' ? t.all : sportTranslations[sport]?.[language] || sport;
            return (
              <button
                key={sport}
                onClick={() => setSelectedSport(sport)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  selectedSport === sport
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-200 dark:bg-tribe-mid text-theme-primary hover:bg-stone-300 dark:hover:bg-tribe-card'
                }`}
              >
                {sportName}
              </button>
            );
          })}
          {!showAllSports && sportOptions.length > 8 && (
            <button
              onClick={() => setShowAllSports(true)}
              className="px-4 py-2 rounded-full text-sm font-medium transition bg-stone-200 dark:bg-tribe-mid text-tribe-green hover:bg-stone-300 dark:hover:bg-tribe-card"
            >
              {language === 'es' ? 'Mas' : 'More'}
            </button>
          )}
          {showAllSports && (
            <button
              onClick={() => setShowAllSports(false)}
              className="px-4 py-2 rounded-full text-sm font-medium transition bg-stone-200 dark:bg-tribe-mid text-tribe-green hover:bg-stone-300 dark:hover:bg-tribe-card"
            >
              {language === 'es' ? 'Menos' : 'Less'}
            </button>
          )}
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-theme-primary mb-4">{t.discover}</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-64">
                <SkeletonCard />
              </div>
            ))}
          </div>
        ) : filteredCommunities.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredCommunities.map((community) => (
              <CommunityCard key={community.id} community={community} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-theme-primary font-medium">{t.noCommunities}</p>
            <p className="text-sm text-stone-500 dark:text-gray-400">{t.noCommunitiesDesc}</p>
          </div>
        )}
      </section>
    </div>
  );
}
