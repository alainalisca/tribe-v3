'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchNearbyAthletes } from '@/lib/dal/connections';
import TrainingPartnerCard from './TrainingPartnerCard';
import InviteToSessionSheet from './InviteToSessionSheet';
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
  const [inviteTarget, setInviteTarget] = useState<TrainingPartner | null>(null);

  const isEs = language === 'es';

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

    // Get user's location — fallback to Medellin
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

  // Fetch nearby athletes
  useEffect(() => {
    const load = async () => {
      if (!userId || !userLocation) return;

      setLoading(true);
      setError(null);

      const result = await fetchNearbyAthletes(
        supabase,
        userId,
        userLocation.lat,
        userLocation.lng,
        selectedSport || undefined
      );

      if (result.success && result.data) {
        setPartners(result.data);
      } else {
        setError(result.error || null);
      }

      setLoading(false);
    };

    load();
  }, [supabase, userId, userLocation, selectedSport]);

  const t = (key: string): string => {
    const translations: Record<string, Record<string, string>> = {
      findTrainingPartners: {
        en: 'Find Training Partners',
        es: 'Encontrar Companeros de Entrenamiento',
      },
      seeAll: { en: 'See All', es: 'Ver Todo' },
      noPartnersFound: {
        en: 'No athletes nearby yet',
        es: 'No hay atletas cerca aun',
      },
      createSession: {
        en: 'Be the first to create a session!',
        es: 'Se el primero en crear una sesion!',
      },
      allSports: { en: 'All', es: 'Todo' },
    };
    return translations[key]?.[language] || key;
  };

  return (
    <div className="bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">{t('findTrainingPartners')}</h2>
        <Link
          href="/training-partners"
          className="flex items-center gap-1 text-[#A3E635] font-semibold text-sm hover:text-[#8fd61d]"
        >
          {t('seeAll')} <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Sport filter pills */}
      <div className="overflow-x-auto scrollbar-hide">
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

      {/* Athletes scroll */}
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
      ) : partners.length === 0 ? (
        <div className="mx-4 p-6 bg-stone-100 dark:bg-[#3D4349] rounded-lg text-center">
          <p className="text-sm text-stone-600 dark:text-gray-400 mb-2">{t('noPartnersFound')}</p>
          <Link
            href="/create"
            className="inline-block mt-2 px-4 py-2 bg-[#A3E635] text-stone-900 text-sm font-semibold rounded-full hover:bg-[#8fd61d] transition"
          >
            {t('createSession')}
          </Link>
        </div>
      ) : (
        <div ref={scrollContainerRef} className="px-4 overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 w-max">
            {partners.map((partner) => (
              <TrainingPartnerCard
                key={partner.id}
                partner={partner}
                language={language}
                onInvite={() => setInviteTarget(partner)}
              />
            ))}
          </div>
        </div>
      )}

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
