'use client';

import Link from 'next/link';
import { Users, Mountain, Zap } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { StravaRoute } from '@/lib/dal/stravaRoutes';

interface StravaRouteCardProps {
  route: StravaRoute;
  language: string;
}

const sportIcons: Record<string, string> = {
  Running: '🏃',
  Cycling: '🚴',
};

const sportLabels: Record<string, Record<string, string>> = {
  Running: { en: 'Running', es: 'Carrera' },
  Cycling: { en: 'Cycling', es: 'Ciclismo' },
};

export default function StravaRouteCard({ route, language }: StravaRouteCardProps) {
  const { language: currentLanguage } = useLanguage();
  const lang = currentLanguage || language;

  const sportLabel = sportLabels[route.sport]?.[lang === 'es' ? 'es' : 'en'] || route.sport;
  const sportIcon = sportIcons[route.sport] || '🗺️';

  // Format distance: convert meters to km
  const distanceKm = (route.distance_meters / 1000).toFixed(1);

  // Format elevation gain
  const elevationDisplay = route.elevation_gain ? `${route.elevation_gain}m` : 'N/A';

  // Format athlete and star counts
  const athleteCount = route.athlete_count ? route.athlete_count.toLocaleString() : '0';
  const starCount = route.star_count ? route.star_count.toLocaleString() : '0';

  const createParams = new URLSearchParams({
    title: route.name,
    sport: route.sport,
    lat: route.start_lat.toString(),
    lng: route.start_lng.toString(),
  }).toString();

  return (
    <Link href={`/create?${createParams}`}>
      <div className="flex-shrink-0 w-72 bg-white dark:bg-[#52575D] rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow cursor-pointer">
        {/* Header with sport and city */}
        <div className="bg-gradient-to-r from-[#A3E635] to-[#9EE551] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{sportIcon}</span>
              <div>
                <p className="font-semibold text-[#272D34]">{sportLabel}</p>
                {route.city && <p className="text-xs text-[#272D34] opacity-75">{route.city}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Route name */}
          <div>
            <h3 className="font-semibold text-theme-primary line-clamp-2">{route.name}</h3>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Distance */}
            <div className="bg-[#3D4349] dark:bg-[#3D4349] rounded-lg p-2">
              <p className="text-xs text-stone-400 dark:text-gray-400 mb-1">
                {lang === 'es' ? 'Distancia' : 'Distance'}
              </p>
              <p className="text-sm font-semibold text-[#A3E635]">{distanceKm} km</p>
            </div>

            {/* Elevation */}
            <div className="bg-[#3D4349] dark:bg-[#3D4349] rounded-lg p-2 flex flex-col items-center justify-center">
              <Mountain className="w-4 h-4 text-[#A3E635] mb-1" />
              <p className="text-sm font-semibold text-[#A3E635]">{elevationDisplay}</p>
            </div>

            {/* Stars */}
            <div className="bg-[#3D4349] dark:bg-[#3D4349] rounded-lg p-2 flex flex-col items-center justify-center">
              <Zap className="w-4 h-4 text-yellow-400 mb-1" />
              <p className="text-sm font-semibold text-yellow-400">{starCount}</p>
            </div>
          </div>

          {/* Athlete count */}
          <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-gray-300">
            <Users className="w-4 h-4" />
            <span>
              {athleteCount} {lang === 'es' ? 'atletas' : 'athletes'}
            </span>
          </div>

          {/* CTA Button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              const link = document.createElement('a');
              link.href = `/create?${createParams}`;
              link.click();
            }}
            className="w-full mt-2 bg-[#A3E635] hover:bg-[#94D91E] dark:bg-[#A3E635] dark:hover:bg-[#94D91E] text-[#272D34] dark:text-[#272D34] font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {lang === 'es' ? 'Crear Sesión en Esta Ruta' : 'Create Session on This Route'} →
          </button>
        </div>
      </div>
    </Link>
  );
}
