'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import VenueSessionTemplate from './VenueSessionTemplate';
import type { PopularVenue } from '@/lib/dal/venues';
import { ACTIVE_CITY } from '@/lib/city-config';

interface PopularVenuesSectionProps {
  language: string;
}

export default function PopularVenuesSection({ language }: PopularVenuesSectionProps) {
  const { language: currentLanguage } = useLanguage();
  const lang = currentLanguage || language;

  const [venues, setVenues] = useState<(PopularVenue & { distance_km?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  // Get user location and fetch venues
  useEffect(() => {
    if (!navigator.geolocation) {
      setError(lang === 'es' ? 'Geolocalización no disponible' : 'Geolocation unavailable');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        try {
          const response = await fetch(`/api/venues/nearby?lat=${latitude}&lng=${longitude}&limit=15&radius=5000`);

          if (!response.ok) {
            throw new Error('Failed to fetch venues');
          }

          const data = await response.json();
          setVenues(data.venues || []);
        } catch (err) {
          setError(lang === 'es' ? 'Error al cargar lugares' : 'Failed to load venues');
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError(lang === 'es' ? 'Permiso de ubicación denegado' : 'Location permission denied');
        setLoading(false);
      }
    );
  }, [lang]);

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
  }, [venues]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 300;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (loading) {
    return (
      <section className="w-full bg-stone-100 dark:bg-tribe-surface rounded-xl p-5 mb-4 space-y-3">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">
          📍 {lang === 'es' ? `Lugares Populares en ${ACTIVE_CITY.name}` : `Popular Spots in ${ACTIVE_CITY.name}`}
        </h2>
        <div className="flex items-center justify-center h-32 bg-tribe-surface dark:bg-tribe-surface rounded-lg">
          <Loader className="w-6 h-6 animate-spin text-tribe-green" />
        </div>
      </section>
    );
  }

  if (error || venues.length === 0) {
    return (
      <section className="w-full bg-stone-100 dark:bg-tribe-surface rounded-xl p-5 mb-4 space-y-3">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">
          📍 {lang === 'es' ? `Lugares Populares en ${ACTIVE_CITY.name}` : `Popular Spots in ${ACTIVE_CITY.name}`}
        </h2>
        <div className="flex items-center justify-center h-32 bg-tribe-surface dark:bg-tribe-surface rounded-lg">
          <p className="text-stone-400 text-center px-4">
            {error || (lang === 'es' ? 'No hay lugares disponibles' : 'No venues available')}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full bg-stone-100 dark:bg-tribe-surface rounded-xl p-5 mb-4 space-y-3">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white">
        📍 {lang === 'es' ? `Lugares Populares en ${ACTIVE_CITY.name}` : `Popular Spots in ${ACTIVE_CITY.name}`}
      </h2>

      {/* Horizontal scrollable container */}
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
          {venues.map((venue) => (
            <div key={venue.id} className="flex-shrink-0">
              <VenueSessionTemplate
                venue={venue}
                userLat={userLocation?.lat || 0}
                userLng={userLocation?.lng || 0}
                language={lang}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
