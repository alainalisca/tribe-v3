'use client';

import Link from 'next/link';
import { ExternalEvent } from '@/lib/dal/externalEvents';
import { Button } from '@/components/ui/button';

interface ExternalEventCardProps {
  event: ExternalEvent;
  language: string;
}

const SPORT_ICONS: Record<string, string> = {
  running: '🏃',
  cycling: '🚴',
  hiking: '🥾',
  yoga: '🧘',
  crossfit: '💪',
  soccer: '⚽',
  swimming: '🏊',
  fitness: '🏋️',
  sports: '🏆',
};

const SPORT_LABELS: Record<string, Record<string, string>> = {
  en: {
    running: 'Running',
    cycling: 'Cycling',
    hiking: 'Hiking',
    yoga: 'Yoga',
    crossfit: 'Crossfit',
    soccer: 'Soccer',
    swimming: 'Swimming',
    fitness: 'Fitness',
    sports: 'Sports',
  },
  es: {
    running: 'Carrera',
    cycling: 'Ciclismo',
    hiking: 'Senderismo',
    yoga: 'Yoga',
    crossfit: 'Crossfit',
    soccer: 'Fútbol',
    swimming: 'Natación',
    fitness: 'Fitness',
    sports: 'Deportes',
  },
};

export default function ExternalEventCard({ event, language }: ExternalEventCardProps) {
  const lang = (language === 'es' ? 'es' : 'en') as 'en' | 'es';
  const startTime = new Date(event.start_time);
  const formattedDate = startTime.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = startTime.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const sportLabel = SPORT_LABELS[lang][event.sport as keyof (typeof SPORT_LABELS)['en']] || event.sport;
  const sportIcon = SPORT_ICONS[event.sport as keyof typeof SPORT_ICONS] || '🏋️';

  const createSessionText = lang === 'es' ? 'Crear Sesion Tribe' : 'Create Tribe Session';
  const viewEventText = lang === 'es' ? 'Ver Evento' : 'View Event';

  return (
    <div className="flex-shrink-0 w-72 bg-tribe-surface border border-tribe-mid rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
      {/* Event Image or Placeholder */}
      {event.image_url ? (
        <div className="relative w-full h-40 bg-stone-700 overflow-hidden">
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="w-full h-40 bg-gradient-to-br from-tribe-mid to-tribe-surface flex items-center justify-center">
          <span className="text-5xl">{sportIcon}</span>
        </div>
      )}

      {/* Card Content */}
      <div className="p-4 space-y-3">
        {/* Sport Badge + External indicator */}
        <div className="flex items-center gap-2">
          <span className="text-xs bg-blue-600 text-white font-bold px-3 py-1 rounded-full">
            {lang === 'es' ? 'Externo' : 'External'}
          </span>
          <span className="text-xs bg-tribe-mid text-white px-3 py-1 rounded-full">
            {sportIcon} {sportLabel}
          </span>
        </div>

        {/* Title — clickable link to Eventbrite page */}
        <a href={event.event_url} target="_blank" rel="noopener noreferrer" className="block">
          <h3 className="text-sm font-bold text-white line-clamp-2 hover:text-tribe-green transition-colors">
            {event.title}
          </h3>
        </a>

        {/* Date and Time */}
        <div className="text-xs text-gray-300">
          <div>📅 {formattedDate}</div>
          <div>🕐 {formattedTime}</div>
        </div>

        {/* Location */}
        <div className="text-xs text-gray-300 line-clamp-1">📍 {event.location_name}</div>

        {/* Athlete Count */}
        {event.participant_count && (
          <div className="text-xs text-gray-400">
            👥 {event.participant_count} {lang === 'es' ? 'interesados' : 'interested'}
          </div>
        )}

        {/* Organizer */}
        {event.organizer_name && <div className="text-xs text-gray-400 line-clamp-1">🎯 {event.organizer_name}</div>}

        {/* Description Preview */}
        {event.description && <p className="text-xs text-gray-400 line-clamp-2">{event.description}</p>}

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <a href={event.event_url} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" size="sm" className="w-full border-tribe-mid text-white hover:bg-tribe-mid">
              {viewEventText}
            </Button>
          </a>
          <Link
            href={`/create?externalEventId=${event.id}&title=${encodeURIComponent(
              event.title
            )}&sport=${encodeURIComponent(event.sport)}&location=${encodeURIComponent(
              event.location_name
            )}&lat=${event.location_lat}&lng=${event.location_lng}`}
            className="flex-1"
          >
            <Button size="sm" className="w-full bg-green-500 hover:bg-green-600 text-white">
              {createSessionText}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
