'use client';

import { useEffect, useRef, useState } from 'react';
import ExternalEventCard from './ExternalEventCard';
import { ExternalEvent } from '@/lib/dal/externalEvents';
import { Button } from '@/components/ui/button';

interface NearbyEventsProps {
  language: string;
}

const SPORTS = ['running', 'cycling', 'hiking', 'yoga', 'crossfit', 'soccer', 'swimming', 'fitness'];

const SPORT_LABELS: Record<string, Record<string, string>> = {
  en: {
    all: 'All Sports',
    running: 'Running',
    cycling: 'Cycling',
    hiking: 'Hiking',
    yoga: 'Yoga',
    crossfit: 'Crossfit',
    soccer: 'Soccer',
    swimming: 'Swimming',
    fitness: 'Fitness',
  },
  es: {
    all: 'Todos los Deportes',
    running: 'Carrera',
    cycling: 'Ciclismo',
    hiking: 'Senderismo',
    yoga: 'Yoga',
    crossfit: 'Crossfit',
    soccer: 'Fútbol',
    swimming: 'Natación',
    fitness: 'Fitness',
  },
};

const SPORT_ICONS: Record<string, string> = {
  all: '🎯',
  running: '🏃',
  cycling: '🚴',
  hiking: '🥾',
  yoga: '🧘',
  crossfit: '💪',
  soccer: '⚽',
  swimming: '🏊',
  fitness: '🏋️',
};

export default function NearbyEvents({ language }: NearbyEventsProps) {
  const lang = (language === 'es' ? 'es' : 'en') as 'en' | 'es';
  const [events, setEvents] = useState<ExternalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get user location and fetch events
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get user location
        if (!navigator.geolocation) {
          setError(lang === 'es' ? 'Geolocalización no disponible' : 'Geolocation not available');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;

            // Fetch events from sync endpoint
            const params = new URLSearchParams({
              lat: latitude.toString(),
              lng: longitude.toString(),
              radius: '25',
            });

            if (selectedSport) {
              params.append('sport', selectedSport);
            }

            const response = await fetch(`/api/events/sync?${params}`);

            if (!response.ok) {
              throw new Error('Failed to fetch events');
            }

            const data = await response.json();
            setEvents(data.events || []);

            if (data.events?.length === 0) {
              setError(lang === 'es' ? 'No hay eventos cercanos en este momento' : 'No nearby events at this time');
            }
          },
          (error) => {
            console.error('Geolocation error:', error);
            setError(lang === 'es' ? 'No se pudo obtener tu ubicación' : 'Could not get your location');
          }
        );
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(lang === 'es' ? 'Error al cargar eventos' : 'Error loading events');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [selectedSport, lang]);

  // Scroll to show selected sport
  const scrollToSport = (sport: string) => {
    setSelectedSport(sport === 'all' ? undefined : sport);
  };

  if (loading) {
    return (
      <div className="bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-3">
          🎯 {lang === 'es' ? 'Sucediendo Cerca' : 'Happening Near You'}
        </h2>
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {['all', ...SPORTS].map((sport) => (
            <div key={sport} className="flex-shrink-0 h-10 bg-[#52575D] rounded-full w-24 animate-pulse" />
          ))}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-72 h-80 bg-[#52575D] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4 border border-[#52575D]">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-3">
          🎯 {lang === 'es' ? 'Sucediendo Cerca' : 'Happening Near You'}
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            {lang === 'es'
              ? 'Crea tu propia sesión o vuelve más tarde para ver eventos cercanos.'
              : 'Create your own session or check back later for nearby events.'}
          </p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return null;
  }

  return (
    <div className="bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4">
      {/* Header */}
      <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-3">
        🎯 {lang === 'es' ? 'Sucediendo Cerca' : 'Happening Near You'}
      </h2>

      {/* Sport Filter Pills */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide" ref={scrollContainerRef}>
        <Button
          variant={selectedSport === undefined ? 'default' : 'outline'}
          size="sm"
          onClick={() => scrollToSport('all')}
          className={`flex-shrink-0 ${
            selectedSport === undefined
              ? 'bg-[#22C55E] hover:bg-[#16A34A] text-white'
              : 'border-[#52575D] text-white hover:bg-[#52575D]'
          }`}
        >
          {SPORT_ICONS['all']} {SPORT_LABELS[lang]['all']}
        </Button>

        {SPORTS.map((sport) => (
          <Button
            key={sport}
            variant={selectedSport === sport ? 'default' : 'outline'}
            size="sm"
            onClick={() => scrollToSport(sport)}
            className={`flex-shrink-0 ${
              selectedSport === sport
                ? 'bg-[#22C55E] hover:bg-[#16A34A] text-white'
                : 'border-[#52575D] text-white hover:bg-[#52575D]'
            }`}
          >
            {SPORT_ICONS[sport as keyof typeof SPORT_ICONS]}{' '}
            {SPORT_LABELS[lang][sport as keyof (typeof SPORT_LABELS)['en']]}
          </Button>
        ))}
      </div>

      {/* Events Cards - Horizontal Scroll */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {events.map((event) => (
          <ExternalEventCard key={`${event.source}:${event.external_id}`} event={event} language={language} />
        ))}
      </div>

      {/* Fallback empty state within the section */}
      {events.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-400">
            {lang === 'es' ? 'No hay eventos disponibles en este momento' : 'No events available at this time'}
          </p>
        </div>
      )}
    </div>
  );
}
