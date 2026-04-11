'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import StravaRouteCard from './StravaRouteCard';
import type { StravaRoute } from '@/lib/dal/stravaRoutes';

interface PopularRoutesSectionProps {
  language: string;
}

export default function PopularRoutesSection({ language }: PopularRoutesSectionProps) {
  const { language: currentLanguage } = useLanguage();
  const lang = currentLanguage || language;

  const [routes, setRoutes] = useState<StravaRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedSport, setSelectedSport] = useState<'Running' | 'Cycling'>('Running');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  // Get user location
  useEffect(() => {
    if (!navigator.geolocation) {
      setError(lang === 'es' ? 'Geolocalización no disponible' : 'Geolocation unavailable');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
      },
      () => {
        setError(lang === 'es' ? 'Permiso de ubicación denegado' : 'Location permission denied');
        setLoading(false);
      }
    );
  }, [lang]);

  // Fetch routes when location or sport changes
  useEffect(() => {
    if (!userLocation) return;

    const fetchRoutes = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/routes/strava?lat=${userLocation.lat}&lng=${userLocation.lng}&sport=${selectedSport}&limit=15`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch routes');
        }

        const data = await response.json();
        setRoutes(data.routes || []);
        setError(null);
      } catch (err) {
        setError(lang === 'es' ? 'Error al cargar rutas' : 'Failed to load routes');
      } finally {
        setLoading(false);
      }
    };

    fetchRoutes();
  }, [userLocation, selectedSport, lang]);

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

  if (error && !userLocation) {
    return (
      <section className="w-full px-4 py-6 space-y-4">
        <h2 className="text-xl font-bold text-theme-primary">
          🗺️ {lang === 'es' ? 'Rutas Populares Cerca' : 'Popular Routes Near You'}
        </h2>
        <div className="flex items-center justify-center h-32 bg-[#3D4349] dark:bg-[#3D4349] rounded-lg">
          <p className="text-stone-400 text-center px-4">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">
          🗺️ {lang === 'es' ? 'Rutas Populares Cerca' : 'Popular Routes Near You'}
        </h2>
      </div>

      {/* Sport toggle */}
      <div className="flex gap-2">
        {(['Running', 'Cycling'] as const).map((sport) => (
          <button
            key={sport}
            onClick={() => setSelectedSport(sport)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedSport === sport
                ? 'bg-[#A3E635] text-[#272D34]'
                : 'bg-stone-200 dark:bg-[#52575D] text-stone-600 dark:text-gray-300 hover:bg-stone-300 dark:hover:bg-[#5e6369]'
            }`}
          >
            {sport === 'Running' ? (lang === 'es' ? 'Correr' : 'Running') : lang === 'es' ? 'Ciclismo' : 'Cycling'}
          </button>
        ))}
      </div>

      {loading && routes.length === 0 ? (
        <div className="flex items-center justify-center h-32 bg-[#3D4349] dark:bg-[#3D4349] rounded-lg">
          <Loader className="w-6 h-6 animate-spin text-[#A3E635]" />
        </div>
      ) : routes.length === 0 ? (
        <div className="flex items-center justify-center h-32 bg-[#3D4349] dark:bg-[#3D4349] rounded-lg">
          <p className="text-stone-400 text-center px-4">
            {lang === 'es' ? 'No hay rutas disponibles' : 'No routes available'}
          </p>
        </div>
      ) : (
        <div className="relative group">
          {/* Left arrow */}
          {showLeftArrow && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 rounded-full p-2 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
          )}

          {/* Right arrow */}
          {showRightArrow && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 rounded-full p-2 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          )}

          {/* Scroll container */}
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto scrollbar-hide flex gap-4 pb-2"
            style={{ scrollBehavior: 'smooth' }}
          >
            {routes.map((route) => (
              <div key={route.id} className="flex-shrink-0">
                <StravaRouteCard route={route} language={lang} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
