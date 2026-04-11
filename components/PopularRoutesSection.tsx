'use client';

// TODO: Future feature — allow users to submit their own routes

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader, Mountain } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { fetchPopularRoutes } from '@/lib/dal/stravaRoutes';
import type { PopularRoute } from '@/lib/dal/stravaRoutes';

interface PopularRoutesSectionProps {
  language: string;
}

type SportFilter = 'running' | 'cycling' | 'hiking';

const sportLabels: Record<SportFilter, { en: string; es: string; icon: string }> = {
  running: { en: 'Running', es: 'Correr', icon: '🏃' },
  cycling: { en: 'Cycling', es: 'Ciclismo', icon: '🚴' },
  hiking: { en: 'Hiking', es: 'Senderismo', icon: '🥾' },
};

const difficultyLabels: Record<string, { en: string; es: string }> = {
  easy: { en: 'Easy', es: 'Fácil' },
  moderate: { en: 'Moderate', es: 'Moderado' },
  hard: { en: 'Hard', es: 'Difícil' },
};

const difficultyColors: Record<string, string> = {
  easy: 'text-green-400',
  moderate: 'text-yellow-400',
  hard: 'text-red-400',
};

export default function PopularRoutesSection({ language }: PopularRoutesSectionProps) {
  const { language: currentLanguage } = useLanguage();
  const lang = currentLanguage || language;

  const [routes, setRoutes] = useState<PopularRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<SportFilter>('running');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  // Fetch routes when sport changes
  useEffect(() => {
    let cancelled = false;

    const loadRoutes = async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const result = await fetchPopularRoutes(supabase, selectedSport, 15);

        if (cancelled) return;

        if (result.success && result.data) {
          setRoutes(result.data);
          setError(null);
        } else {
          setError(result.error || (lang === 'es' ? 'Error al cargar rutas' : 'Failed to load routes'));
        }
      } catch {
        if (!cancelled) {
          setError(lang === 'es' ? 'Error al cargar rutas' : 'Failed to load routes');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [selectedSport, lang]);

  // Handle scroll visibility for arrows
  const updateScrollArrows = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    updateScrollArrows();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', updateScrollArrows);
      return () => container.removeEventListener('scroll', updateScrollArrows);
    }
  }, [routes]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 300;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="w-full bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">
          {lang === 'es' ? 'Rutas Populares en Medellín' : 'Popular Routes in Medellín'}
        </h2>
      </div>

      {/* Sport toggle */}
      <div className="flex gap-2">
        {(['running', 'cycling', 'hiking'] as const).map((sport) => (
          <button
            key={sport}
            onClick={() => setSelectedSport(sport)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedSport === sport
                ? 'bg-[#A3E635] text-[#272D34]'
                : 'bg-stone-200 dark:bg-[#52575D] text-stone-600 dark:text-gray-300 hover:bg-stone-300 dark:hover:bg-[#5e6369]'
            }`}
          >
            {sportLabels[sport].icon} {lang === 'es' ? sportLabels[sport].es : sportLabels[sport].en}
          </button>
        ))}
      </div>

      {loading && routes.length === 0 ? (
        <div className="flex items-center justify-center h-32 bg-[#3D4349] dark:bg-[#3D4349] rounded-lg">
          <Loader className="w-6 h-6 animate-spin text-[#A3E635]" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-32 bg-[#3D4349] dark:bg-[#3D4349] rounded-lg">
          <p className="text-stone-400 text-center px-4">{error}</p>
        </div>
      ) : routes.length === 0 ? (
        <div className="flex items-center justify-center h-32 bg-[#3D4349] dark:bg-[#3D4349] rounded-lg">
          <p className="text-stone-400 text-center px-4">
            {lang === 'es' ? 'No hay rutas disponibles' : 'No routes available'}
          </p>
        </div>
      ) : (
        <div className="relative group">
          {showLeftArrow && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 rounded-full p-2 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          )}
          {showRightArrow && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 rounded-full p-2 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          )}

          <div
            ref={scrollContainerRef}
            className="overflow-x-auto scrollbar-hide flex gap-4 pb-2"
            style={{ scrollBehavior: 'smooth' }}
          >
            {routes.map((route) => (
              <RouteCard key={route.id} route={route} language={lang} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Inline route card — replaces the old StravaRouteCard */
function RouteCard({ route, language }: { route: PopularRoute; language: string }) {
  const lang = language;
  const sport = sportLabels[route.sport_type] || sportLabels.running;
  const difficulty = difficultyLabels[route.difficulty] || difficultyLabels.easy;
  const diffColor = difficultyColors[route.difficulty] || 'text-gray-400';
  const description = lang === 'es' ? route.description_es : route.description_en;

  const createParams = new URLSearchParams({
    title: route.name,
    sport: route.sport_type,
    lat: route.start_lat.toString(),
    lng: route.start_lng.toString(),
  }).toString();

  return (
    <Link href={`/create?${createParams}`}>
      <div className="flex-shrink-0 w-72 bg-white dark:bg-[#52575D] rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow cursor-pointer">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#A3E635] to-[#9EE551] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{sport.icon}</span>
            <div>
              <p className="font-semibold text-[#272D34]">{lang === 'es' ? sport.es : sport.en}</p>
              <p className={`text-xs font-medium ${diffColor}`}>{lang === 'es' ? difficulty.es : difficulty.en}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <h3 className="font-semibold text-theme-primary line-clamp-2">{route.name}</h3>

          {description && <p className="text-xs text-stone-500 dark:text-gray-300 line-clamp-2">{description}</p>}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-[#3D4349] dark:bg-[#3D4349] rounded-lg p-2">
              <p className="text-xs text-stone-400 dark:text-gray-400 mb-1">
                {lang === 'es' ? 'Distancia' : 'Distance'}
              </p>
              <p className="text-sm font-semibold text-[#A3E635]">{route.distance_km} km</p>
            </div>
            <div className="bg-[#3D4349] dark:bg-[#3D4349] rounded-lg p-2 flex flex-col items-center justify-center">
              <Mountain className="w-4 h-4 text-[#A3E635] mb-1" />
              <p className="text-sm font-semibold text-[#A3E635]">{route.elevation_gain_m}m</p>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={(e) => {
              e.preventDefault();
              window.location.href = `/create?${createParams}`;
            }}
            className="w-full mt-2 bg-[#A3E635] hover:bg-[#94D91E] text-[#272D34] font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {lang === 'es' ? 'Crear Sesión en Esta Ruta' : 'Create Session on This Route'}
          </button>
        </div>
      </div>
    </Link>
  );
}
