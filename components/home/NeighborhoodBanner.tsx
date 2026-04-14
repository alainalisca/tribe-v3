'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { detectNeighborhood, getNearestNeighborhood, type Neighborhood } from '@/lib/city-config';
import { useState, useEffect } from 'react';

interface NeighborhoodBannerProps {
  userLat?: number | null;
  userLng?: number | null;
  todaySessionCount?: number;
}

export default function NeighborhoodBanner({ userLat, userLng, todaySessionCount = 0 }: NeighborhoodBannerProps) {
  const { language } = useLanguage();
  const [hood, setHood] = useState<Neighborhood | null>(null);

  useEffect(() => {
    if (userLat && userLng) {
      const detected = detectNeighborhood(userLat, userLng) || getNearestNeighborhood(userLat, userLng);
      setHood(detected);
    }
  }, [userLat, userLng]);

  if (!hood) return null;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-blue-500/10 to-tribe-green/5 border-b border-blue-500/15">
      <span className="text-base">📍</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-stone-900 dark:text-white truncate">{hood.name}</div>
        <div className="text-[10px] text-stone-500 dark:text-gray-500">
          {todaySessionCount > 0
            ? language === 'es'
              ? `${todaySessionCount} sesiones hoy`
              : `${todaySessionCount} sessions today`
            : language === 'es'
              ? 'S\u00e9 el primero en crear una sesi\u00f3n aqu\u00ed'
              : 'Be the first to create a session here'}
        </div>
      </div>
    </div>
  );
}
