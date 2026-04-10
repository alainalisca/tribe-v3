'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchTrainingPartners } from '@/lib/dal/connections';
import TrainingPartnerCard from './TrainingPartnerCard';
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

interface FindTrainingPartnersProps {
  language: string;
}

export default function FindTrainingPartners({ language }: FindTrainingPartnersProps) {
  const supabase = createClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [partners, setPartners] = useState<TrainingPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user and location
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);
      }
    };

    getUser();

    // Get user's location
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Fallback to default location
          setUserLocation({ lat: 40.7128, lng: -74.006 }); // NYC
        }
      );
    } else {
      setUserLocation({ lat: 40.7128, lng: -74.006 });
    }
  }, [supabase]);

  // Fetch training partners
  useEffect(() => {
    const fetch = async () => {
      if (!userId || !userLocation) return;

      setLoading(true);
      setError(null);

      const result = await fetchTrainingPartners(
        supabase,
        userId,
        userLocation.lat,
        userLocation.lng,
        selectedSport || undefined
      );

      if (result.success && result.data) {
        setPartners(result.data.slice(0, 10)); // Show top 10
      } else {
        setError(result.error || null);
      }

      setLoading(false);
    };

    fetch();
  }, [supabase, userId, userLocation, selectedSport]);

  const filteredPartners = selectedSport ? partners.filter((p) => p.sports.includes(selectedSport)) : partners;

  const t = (key: string): string => {
    const translations: Record<string, Record<string, string>> = {
      findTrainingPartners: {
        en: 'Find Training Partners',
        es: 'Encontrar Compañeros de Entrenamiento',
      },
      seeAll: {
        en: 'See All',
        es: 'Ver Todo',
      },
      noPartnersFound: {
        en: 'No training partners found nearby',
        es: 'Sin compañeros de entrenamiento cerca',
      },
      createSession: {
        en: 'Create a session to attract them!',
        es: 'Crea una sesión para atraerlos!',
      },
      allSports: {
        en: 'All',
        es: 'Todo',
      },
    };

    return translations[key]?.[language] || key;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">🏋️ {t('findTrainingPartners')}</h2>
        <Link
          href="/training-partners"
          className="flex items-center gap-1 text-[#A3E635] font-semibold text-sm hover:text-[#8fd61d]"
        >
          {t('seeAll')} <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Sport filter pills */}
      <div className="overflow-x-auto scrollbar-hide px-4">
        <div className="flex gap-2 w-max">
          <button
            onClick={() => setSelectedSport(null)}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
              selectedSport === null
                ? 'bg-[#A3E635] text-stone-900'
                : 'bg-stone-200 dark:bg-[#52575D] text-stone-900 dark:text-gray-300'
            }`}
          >
            {t('allSports')}
          </button>

          {SPORTS_LIST.map((sport) => (
            <button
              key={sport}
              onClick={() => setSelectedSport(sport)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                selectedSport === sport
                  ? 'bg-[#A3E635] text-stone-900'
                  : 'bg-stone-200 dark:bg-[#52575D] text-stone-900 dark:text-gray-300'
              }`}
            >
              {sportTranslations[sport]?.[language as 'en' | 'es'] || sport}
            </button>
          ))}
        </div>
      </div>

      {/* Partners scroll */}
      {loading ? (
        <div className="px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 w-max">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-40 h-48 bg-stone-300 dark:bg-[#52575D] rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : filteredPartners.length === 0 ? (
        <div className="mx-4 p-6 bg-stone-100 dark:bg-[#3D4349] rounded-lg text-center">
          <p className="text-sm text-stone-600 dark:text-gray-400 mb-2">{t('noPartnersFound')}</p>
          <p className="text-xs text-stone-500 dark:text-gray-500">{t('createSession')}</p>
        </div>
      ) : (
        <div ref={scrollContainerRef} className="px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 w-max">
            {filteredPartners.map((partner) => (
              <TrainingPartnerCard key={partner.id} partner={partner} language={language} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
