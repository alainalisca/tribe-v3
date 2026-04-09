'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import CommunityCard from '@/components/CommunityCard';
import { SkeletonCard } from '@/components/Skeleton';
import { fetchCommunities, fetchUserCommunities, type CommunityWithCreator } from '@/lib/dal/communities';
import { sportTranslations } from '@/lib/translations';
import { Search, Plus, Loader2 } from 'lucide-react';

const getTranslations = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Comunidades' : 'Communities',
  myCommunities: language === 'es' ? 'Mis Comunidades' : 'My Communities',
  discover: language === 'es' ? 'Descubre' : 'Discover',
  search: language === 'es' ? 'Buscar comunidades...' : 'Search communities...',
  create: language === 'es' ? 'Crear Comunidad' : 'Create Community',
  noCommunities: language === 'es' ? 'No hay comunidades' : 'No communities',
  noCommunitiesDesc: language === 'es'
    ? 'Únete a una comunidad o crea una nueva'
    : 'Join a community or create a new one',
  loading: language === 'es' ? 'Cargando...' : 'Loading...',
  all: language === 'es' ? 'Todos' : 'All',
});

export default function CommunitiesPage() {
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const [userCommunities, setUserCommunities] = useState<CommunityWithCreator[]>([]);
  const [allCommunities, setAllCommunities] = useState<CommunityWithCreator[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<CommunityWithCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState('All');
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

      // Fetch user's communities
      const userResult = await fetchUserCommunities(supabase, uid);
      if (userResult.success) {
        setUserCommunities(userResult.data || []);
      }

      // Fetch all public communities
      const allResult = await fetchCommunities(supabase, { limit: 100 });
      if (allResult.success) {
        setAllCommunities(allResult.data || []);
      }
    } catch (error) {
      logError(error, { action: 'fetchInitialData' });
    } finally {
      setLoading(false);
    }
  }

  function filterCommunities() {
    let results = [...allCommunities];

    if (selectedSport !== 'All') {
      results = results.filter((c) => c.sport === selectedSport);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.description?.toLowerCase().includes(query) ?? false)
      );
    }

    setFilteredCommunities(results);
  }

  const sportOptions = ['All', ...Object.keys(sportTranslations).filter((s) => s !== 'All')];

  return (
    <div className="min-h-screen bg-white dark:bg-[#3D4349] pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-[#404549] border-b border-gray-200 dark:border-[#52575D] z-40">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h1 className="text-2xl font-bold text-theme-primary">{t.title}</h1>
            <Link
              href="/communities/create"
              className="flex items-center gap-2 px-4 py-2 bg-tribe-green text-slate-900 rounded-lg hover:bg-[#92d31f] transition font-medium"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline text-sm">{t.create}</span>
            </Link>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder={t.search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-stone-100 dark:bg-[#52575D] rounded-lg border border-stone-200 dark:border-[#6B7178] text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* My Communities Section */}
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

        {/* Sport Filter Chips */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-500 dark:text-gray-400">
            {language === 'es' ? 'Filtrar por deporte' : 'Filter by sport'}
          </h3>
          <div className="flex flex-wrap gap-2">
            {sportOptions.slice(0, 8).map((sport) => {
              const sportName =
                sport === 'All' ? t.all : sportTranslations[sport]?.[language] || sport;
              return (
                <button
                  key={sport}
                  onClick={() => setSelectedSport(sport)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    selectedSport === sport
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-200 dark:bg-[#52575D] text-theme-primary hover:bg-stone-300 dark:hover:bg-[#6B7178]'
                  }`}
                >
                  {sportName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Discover Section */}
        <section>
          <h2 className="text-lg font-semibold text-theme-primary mb-4">{t.discover}</h2>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64"><SkeletonCard /></div>
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

      <BottomNav />
    </div>
  );
}
