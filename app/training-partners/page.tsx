'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchNearbyAthletes } from '@/lib/dal/connections';
import TrainingPartnerCard from '@/components/TrainingPartnerCard';
import InviteToSessionSheet from '@/components/InviteToSessionSheet';
import { sportTranslations } from '@/lib/translations';
import type { TrainingPartner } from '@/lib/dal/connections';

const SPORTS_LIST = [
  'Running',
  'Cycling',
  'CrossFit',
  'Basketball',
  'Tennis',
  'Soccer',
  'Swimming',
  'Yoga',
  'Boxing',
  'Hiking',
];

function getTranslations(language: 'en' | 'es') {
  return {
    title: language === 'es' ? 'Companeros de Entrenamiento' : 'Training Partners',
    search: language === 'es' ? 'Buscar por nombre...' : 'Search by name...',
    allSports: language === 'es' ? 'Todo' : 'All',
    noResults: language === 'es' ? 'No hay atletas cerca aun' : 'No athletes nearby yet',
    noResultsDesc: language === 'es' ? 'Se el primero en crear una sesion!' : 'Be the first to create a session!',
    loading: language === 'es' ? 'Cargando...' : 'Loading...',
  };
}

export default function TrainingPartnersPage() {
  const supabase = createClient();
  const router = useRouter();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const [partners, setPartners] = useState<TrainingPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState<TrainingPartner | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          setUserLocation({ lat: 6.2442, lng: -75.5812 });
        }
      );
    } else {
      setUserLocation({ lat: 6.2442, lng: -75.5812 });
    }
  }, [supabase]);

  useEffect(() => {
    const load = async () => {
      if (!userId || !userLocation) return;
      setLoading(true);

      const result = await fetchNearbyAthletes(
        supabase,
        userId,
        userLocation.lat,
        userLocation.lng,
        selectedSport || undefined,
        30,
        100
      );

      if (result.success && result.data) {
        setPartners(result.data);
      }
      setLoading(false);
    };
    load();
  }, [supabase, userId, userLocation, selectedSport]);

  const filtered = searchQuery
    ? partners.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : partners;

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface pb-8">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-[#404549] border-b border-gray-200 dark:border-[#52575D]">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-3 space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-lg hover:bg-stone-100 dark:hover:bg-tribe-mid transition"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-stone-900 dark:text-white" />
            </button>
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.title}</h1>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400 pointer-events-none" />
            <input
              type="text"
              placeholder={t.search}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-[#6B7178] text-stone-900 dark:text-gray-100 placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Sport filter pills */}
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
            <div className="flex gap-2 w-max">
              <button
                onClick={() => setSelectedSport(null)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                  selectedSport === null
                    ? 'bg-tribe-green-light text-stone-900'
                    : 'bg-stone-200 dark:bg-tribe-mid text-stone-900 dark:text-gray-300'
                }`}
              >
                {t.allSports}
              </button>
              {SPORTS_LIST.map((sport) => (
                <button
                  key={sport}
                  onClick={() => setSelectedSport(sport)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                    selectedSport === sport
                      ? 'bg-tribe-green-light text-stone-900'
                      : 'bg-stone-200 dark:bg-tribe-mid text-stone-900 dark:text-gray-300'
                  }`}
                >
                  {sportTranslations[sport]?.[language as 'en' | 'es'] || sport}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-56 bg-stone-200 dark:bg-tribe-mid rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-stone-900 dark:text-white font-medium">{t.noResults}</p>
            <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{t.noResultsDesc}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {filtered.map((partner) => (
              <TrainingPartnerCard
                key={partner.id}
                partner={partner}
                language={language}
                onInvite={() => setInviteTarget(partner)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Invite sheet */}
      {inviteTarget && (
        <InviteToSessionSheet
          open={!!inviteTarget}
          onClose={() => setInviteTarget(null)}
          athlete={inviteTarget}
          language={language}
        />
      )}
    </div>
  );
}
