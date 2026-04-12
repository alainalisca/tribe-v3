'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';

interface LocalFitnessEventsSectionProps {
  language: string;
}

interface LocalFitnessEvent {
  id: string;
  name: string;
  sport: string;
  organizer: string | null;
  schedule_text_en: string | null;
  schedule_text_es: string | null;
  location_name: string | null;
  description_en: string | null;
  description_es: string | null;
  is_free: boolean;
  price_text: string | null;
  website_url: string | null;
  start_date: string | null;
  is_recurring: boolean;
  is_active: boolean;
}

const SPORTS = ['running', 'cycling', 'hiking', 'yoga', 'crossfit', 'swimming'] as const;

const SPORT_LABELS: Record<string, { en: string; es: string; icon: string }> = {
  all: { en: 'All', es: 'Todos', icon: '🎯' },
  running: { en: 'Running', es: 'Carrera', icon: '🏃' },
  cycling: { en: 'Cycling', es: 'Ciclismo', icon: '🚴' },
  hiking: { en: 'Hiking', es: 'Senderismo', icon: '🥾' },
  yoga: { en: 'Yoga', es: 'Yoga', icon: '🧘' },
  crossfit: { en: 'CrossFit', es: 'CrossFit', icon: '💪' },
  swimming: { en: 'Swimming', es: 'Natacion', icon: '🏊' },
};

export default function LocalFitnessEventsSection({ language }: LocalFitnessEventsSectionProps) {
  const { language: ctxLang } = useLanguage();
  const lang = (ctxLang || language) === 'es' ? 'es' : 'en';

  const [events, setEvents] = useState<LocalFitnessEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const supabase = createClient();
        let query = supabase
          .from('local_fitness_events')
          .select('*')
          .eq('is_active', true)
          .order('is_recurring', { ascending: false })
          .order('start_date', { ascending: true });

        if (selectedSport !== 'all') {
          query = query.eq('sport', selectedSport);
        }

        const { data, error } = await query;
        if (cancelled) return;

        if (error) {
          logError(error, { action: 'fetchLocalFitnessEvents' });
          setEvents([]);
        } else {
          setEvents((data || []) as LocalFitnessEvent[]);
        }
      } catch (err) {
        if (!cancelled) {
          logError(err, { action: 'fetchLocalFitnessEvents' });
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedSport]);

  return (
    <section className="w-full bg-stone-100 dark:bg-[#3D4349] rounded-xl p-5 mb-4 space-y-3">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white">
        {lang === 'es' ? '🏅 Eventos Fitness Locales' : '🏅 Local Fitness Events'}
      </h2>

      {/* Sport filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {['all', ...SPORTS].map((sport) => {
          const label = SPORT_LABELS[sport] || SPORT_LABELS.all;
          return (
            <button
              key={sport}
              onClick={() => setSelectedSport(sport)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                selectedSport === sport
                  ? 'bg-[#A3E635] text-[#272D34]'
                  : 'bg-stone-200 dark:bg-[#52575D] text-stone-600 dark:text-gray-300 hover:bg-stone-300 dark:hover:bg-[#5e6369]'
              }`}
            >
              {label.icon} {lang === 'es' ? label.es : label.en}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-72 h-56 bg-stone-200 dark:bg-[#52575D] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-stone-500 dark:text-gray-400 text-sm">
            {lang === 'es' ? 'No hay eventos en tu zona todavia' : 'No events in your area yet'}
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {events.map((event) => (
            <EventCard key={event.id} event={event} lang={lang} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Event Card ── */

function EventCard({ event, lang }: { event: LocalFitnessEvent; lang: 'en' | 'es' }) {
  const sportInfo = SPORT_LABELS[event.sport] || SPORT_LABELS.all;
  const schedule = lang === 'es' ? event.schedule_text_es : event.schedule_text_en;
  const description = lang === 'es' ? event.description_es : event.description_en;

  return (
    <div className="flex-shrink-0 w-72 bg-white dark:bg-[#52575D] rounded-xl overflow-hidden shadow-md">
      {/* Header bar */}
      <div className="bg-gradient-to-r from-[#A3E635] to-lime-400 px-4 py-3 flex items-center gap-2">
        <span className="text-2xl">{sportInfo.icon}</span>
        <div className="min-w-0">
          <p className="font-semibold text-[#272D34] text-sm line-clamp-1">{event.name}</p>
          {event.organizer && (
            <span className="text-xs bg-[#272D34]/20 text-[#272D34] px-2 py-0.5 rounded-full font-medium">
              {event.organizer}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-2">
        {description && <p className="text-xs text-stone-500 dark:text-gray-300 line-clamp-2">{description}</p>}

        {schedule && (
          <div className="text-xs text-stone-600 dark:text-gray-300 flex items-start gap-1">
            <span>📅</span>
            <span>{schedule}</span>
          </div>
        )}

        {event.location_name && (
          <div className="text-xs text-stone-600 dark:text-gray-300 flex items-start gap-1">
            <span>📍</span>
            <span className="line-clamp-1">{event.location_name}</span>
          </div>
        )}

        {/* Price / Free badge */}
        <div>
          {event.is_free ? (
            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
              {lang === 'es' ? 'Gratis' : 'Free'}
            </span>
          ) : event.price_text ? (
            <span className="text-xs text-stone-500 dark:text-gray-400 font-medium">{event.price_text}</span>
          ) : null}
        </div>

        {/* Learn More link */}
        {event.website_url && (
          <a
            href={event.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-[#A3E635] hover:underline font-medium mt-1"
          >
            {lang === 'es' ? 'Saber Mas →' : 'Learn More →'}
          </a>
        )}
      </div>
    </div>
  );
}
