'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ExternalEventCard from './ExternalEventCard';
import { ExternalEvent } from '@/lib/dal/externalEvents';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface NearbyEventsProps {
  language: string;
}

/** Minimal shape for a Tribe session displayed in the nearby feed */
interface TribeSession {
  id: string;
  sport: string;
  date: string;
  start_time: string;
  duration: number;
  location: string;
  location_lat: number | null;
  location_lng: number | null;
  max_participants: number;
  current_participants: number | null;
  status: string | null;
  title: string | null;
  creator: {
    name: string;
    avatar_url: string | null;
  } | null;
}

/** Union type for the merged, sorted feed */
type FeedItem =
  | { type: 'tribe'; session: TribeSession; sortDate: number }
  | { type: 'external'; event: ExternalEvent; sortDate: number };

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
    soccer: 'Futbol',
    swimming: 'Natacion',
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
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [hasExternalEvents, setHasExternalEvents] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch upcoming Tribe sessions from Supabase (client-side)
        const supabase = createClient();
        const today = new Date().toISOString().slice(0, 10);

        let sessionQuery = supabase
          .from('sessions')
          .select(
            `id, sport, date, start_time, duration, location, location_lat, location_lng,
             max_participants, current_participants, status, title,
             creator:users!sessions_creator_id_fkey(name, avatar_url)`
          )
          .eq('status', 'active')
          .gte('date', today)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
          .limit(20);

        if (selectedSport) {
          sessionQuery = sessionQuery.eq('sport', selectedSport);
        }

        const sessionsPromise = sessionQuery;

        // 2. Fetch external Eventbrite events (wrapped in try/catch so missing API key doesn't block)
        const externalPromise = (async (): Promise<ExternalEvent[]> => {
          try {
            if (!navigator.geolocation) return [];

            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
            });

            const { latitude, longitude } = position.coords;
            const params = new URLSearchParams({
              lat: latitude.toString(),
              lng: longitude.toString(),
              radius: '25',
            });
            if (selectedSport) {
              params.append('sport', selectedSport);
            }

            const response = await fetch(`/api/events/sync?${params}`);
            if (!response.ok) return [];

            const data = await response.json();
            return data.events || [];
          } catch {
            // Geolocation denied or API key missing — silently return empty
            return [];
          }
        })();

        // Run both in parallel
        const [sessionsResult, externalEvents] = await Promise.all([sessionsPromise, externalPromise]);

        // Build merged feed
        const items: FeedItem[] = [];

        if (sessionsResult.data) {
          for (const raw of sessionsResult.data) {
            // Supabase foreign-key joins may return the related row as a single-element array
            const creatorRaw = raw.creator;
            const creator = Array.isArray(creatorRaw) ? (creatorRaw[0] ?? null) : (creatorRaw ?? null);

            const s: TribeSession = {
              id: raw.id,
              sport: raw.sport,
              date: raw.date,
              start_time: raw.start_time,
              duration: raw.duration,
              location: raw.location,
              location_lat: raw.location_lat,
              location_lng: raw.location_lng,
              max_participants: raw.max_participants,
              current_participants: raw.current_participants,
              status: raw.status,
              title: raw.title,
              creator: creator ? { name: creator.name, avatar_url: creator.avatar_url } : null,
            };
            const sortDate = new Date(`${s.date}T${s.start_time}`).getTime();
            items.push({ type: 'tribe', session: s, sortDate });
          }
        }

        for (const e of externalEvents) {
          const sortDate = new Date(e.start_time).getTime();
          items.push({ type: 'external', event: e, sortDate });
        }

        // Sort interleaved by date ascending
        items.sort((a, b) => a.sortDate - b.sortDate);

        setFeedItems(items);
        setHasExternalEvents(externalEvents.length > 0);

        if (items.length === 0) {
          setError(
            lang === 'es'
              ? 'No hay sesiones ni eventos cercanos en este momento'
              : 'No upcoming sessions or events nearby'
          );
        }
      } catch (err) {
        console.error('Error fetching nearby events:', err);
        setError(lang === 'es' ? 'Error al cargar eventos' : 'Error loading events');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [selectedSport, lang]);

  const scrollToSport = (sport: string) => {
    setSelectedSport(sport === 'all' ? undefined : sport);
  };

  // --- Loading skeleton ---
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

  // --- Empty state with CTA ---
  if (error && feedItems.length === 0) {
    return (
      <div className="bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4 border border-[#52575D]">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-3">
          🎯 {lang === 'es' ? 'Sucediendo Cerca' : 'Happening Near You'}
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">
            {lang === 'es' ? 'No hay sesiones cercanas en este momento' : 'No upcoming sessions nearby'}
          </p>
          <Link href="/create">
            <Button className="bg-[#A3E635] hover:bg-[#84cc16] text-slate-900 font-bold">
              {lang === 'es' ? 'Crear la primera sesion' : 'Create the first session'}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (feedItems.length === 0) {
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

      {/* Cards — Horizontal Scroll */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {feedItems.map((item) =>
          item.type === 'external' ? (
            <ExternalEventCard
              key={`ext:${item.event.source}:${item.event.external_id}`}
              event={item.event}
              language={language}
            />
          ) : (
            <TribeSessionMiniCard key={`tribe:${item.session.id}`} session={item.session} language={language} />
          )
        )}
      </div>

      {/* Eventbrite attribution (only when external events are present) */}
      {hasExternalEvents && (
        <p className="text-xs text-gray-500 mt-2 text-right">
          {lang === 'es' ? 'Eventos externos via Eventbrite' : 'External events via Eventbrite'}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tribe Session Mini-Card (compact card matching the horizontal scroll layout)
// ---------------------------------------------------------------------------

interface TribeSessionMiniCardProps {
  session: TribeSession;
  language: string;
}

function TribeSessionMiniCard({ session, language }: TribeSessionMiniCardProps) {
  const lang = (language === 'es' ? 'es' : 'en') as 'en' | 'es';

  const sportIcon = SPORT_ICONS[session.sport as keyof typeof SPORT_ICONS] || '🏋️';
  const sportLabel = SPORT_LABELS[lang][session.sport as keyof (typeof SPORT_LABELS)['en']] || session.sport;

  const sessionDate = new Date(`${session.date}T${session.start_time}`);
  const formattedDate = sessionDate.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = sessionDate.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const confirmed = session.current_participants ?? 0;
  const spotsLeft = session.max_participants - confirmed;

  return (
    <Link href={`/session/${session.id}`} className="flex-shrink-0 w-72 block">
      <div className="bg-[#3D4349] border border-[#52575D] rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow h-full">
        {/* Sport hero area */}
        <div className="w-full h-40 bg-gradient-to-br from-[#A3E635]/20 to-[#3D4349] flex items-center justify-center">
          <span className="text-5xl">{sportIcon}</span>
        </div>

        {/* Card Content */}
        <div className="p-4 space-y-3">
          {/* Badges */}
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[#A3E635] text-slate-900 font-bold px-3 py-1 rounded-full">Tribe</span>
            <span className="text-xs bg-[#52575D] text-white px-3 py-1 rounded-full">
              {sportIcon} {sportLabel}
            </span>
          </div>

          {/* Title or sport name */}
          <h3 className="text-sm font-bold text-white line-clamp-2">
            {session.title || `${sportLabel} ${lang === 'es' ? 'Sesion' : 'Session'}`}
          </h3>

          {/* Date and Time */}
          <div className="text-xs text-gray-300">
            <div>📅 {formattedDate}</div>
            <div>
              🕐 {formattedTime} — {session.duration} min
            </div>
          </div>

          {/* Location */}
          <div className="text-xs text-gray-300 line-clamp-1">📍 {session.location}</div>

          {/* Participant Count */}
          <div className="text-xs text-gray-400">
            👥 {confirmed}/{session.max_participants} {lang === 'es' ? 'atletas' : 'athletes'}
            {spotsLeft > 0 && (
              <span className="ml-1 text-[#A3E635]">
                ({spotsLeft} {lang === 'es' ? 'cupos' : 'spots left'})
              </span>
            )}
          </div>

          {/* Instructor */}
          {session.creator && (
            <div className="text-xs text-gray-400 line-clamp-1">
              🎯 {lang === 'es' ? 'Por' : 'By'} {session.creator.name}
            </div>
          )}

          {/* Action */}
          <div className="pt-2">
            <Button size="sm" className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-white">
              {lang === 'es' ? 'Ver Sesion' : 'View Session'}
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}
