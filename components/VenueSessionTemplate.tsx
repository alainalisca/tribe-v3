'use client';

import Link from 'next/link';
import { MapPin, Star } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { PopularVenue } from '@/lib/dal/venues';

interface VenueSessionTemplateProps {
  venue: PopularVenue & { distance_km?: number };
  userLat: number;
  userLng: number;
  language: string;
}

const categoryIcons: Record<string, string> = {
  gym: '🏋️',
  park: '🌳',
  pool: '🏊',
  studio: '🧘',
  track: '🏃',
  trail: '🥾',
  box: '📦',
  other: '📍',
};

const categoryLabels: Record<string, Record<string, string>> = {
  gym: { en: 'Gym', es: 'Gimnasio' },
  park: { en: 'Park', es: 'Parque' },
  pool: { en: 'Pool', es: 'Piscina' },
  studio: { en: 'Studio', es: 'Estudio' },
  track: { en: 'Track', es: 'Pista' },
  trail: { en: 'Trail', es: 'Sendero' },
  box: { en: 'Gym Box', es: 'Caja de Gimnasia' },
  other: { en: 'Venue', es: 'Lugar' },
};

export default function VenueSessionTemplate({ venue, userLat, userLng, language }: VenueSessionTemplateProps) {
  const { language: currentLanguage } = useLanguage();
  const lang = currentLanguage || language;

  const categoryLabel = categoryLabels[venue.category]?.[lang === 'es' ? 'es' : 'en'] || venue.category;
  const categoryIcon = categoryIcons[venue.category] || '📍';
  const distance = venue.distance_km ? venue.distance_km.toFixed(1) : '?';
  const distanceLabel = lang === 'es' ? 'km' : 'km';

  const createParams = new URLSearchParams({
    venue_name: venue.name,
    lat: venue.location_lat.toString(),
    lng: venue.location_lng.toString(),
  }).toString();

  const ratingStars = venue.rating ? Math.round(venue.rating) : 0;
  const ratingDisplay = venue.rating ? venue.rating.toFixed(1) : 'N/A';

  return (
    <Link href={`/create?${createParams}`}>
      <div className="flex-shrink-0 w-72 bg-white dark:bg-tribe-mid rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow cursor-pointer">
        {/* Venue image or fallback */}
        {venue.photo_url ? (
          <div
            className="w-full h-40 bg-cover bg-center"
            style={{ backgroundImage: `url(${venue.photo_url})` }}
            aria-label={`${venue.name} photo`}
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-[#A3E635] to-[#9EE551] flex items-center justify-center">
            <span className="text-6xl">{categoryIcon}</span>
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Name and category */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-theme-primary line-clamp-2 flex-1">{venue.name}</h3>
              <span className="text-lg flex-shrink-0">{categoryIcon}</span>
            </div>
            <p className="text-xs text-stone-500 dark:text-gray-400 mt-1">{categoryLabel}</p>
          </div>

          {/* Rating and distance */}
          <div className="flex items-center justify-between text-xs">
            {venue.rating ? (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span className="text-stone-600 dark:text-gray-300">{ratingDisplay}</span>
              </div>
            ) : (
              <span className="text-stone-500 dark:text-gray-400">No rating</span>
            )}
            <div className="flex items-center gap-1 text-stone-500 dark:text-gray-400">
              <MapPin className="w-3 h-3" />
              <span>
                {distance} {distanceLabel}
              </span>
            </div>
          </div>

          {/* Address */}
          {venue.address && <p className="text-xs text-stone-600 dark:text-gray-400 line-clamp-1">{venue.address}</p>}

          {/* Suggested sports tags */}
          {venue.suggested_sports && venue.suggested_sports.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {venue.suggested_sports.slice(0, 2).map((sport) => (
                <span
                  key={sport}
                  className="inline-block px-2 py-1 bg-tribe-green-light dark:bg-tribe-green-light text-[#272D34] dark:text-[#272D34] text-xs font-medium rounded-full"
                >
                  {sport}
                </span>
              ))}
            </div>
          )}

          {/* CTA Button */}
          <button
            onClick={(e) => {
              // Let the Link handle navigation, but make it clear this is clickable
              e.preventDefault();
              const link = document.createElement('a');
              link.href = `/create?${createParams}`;
              link.click();
            }}
            className="w-full mt-2 bg-tribe-green-light hover:bg-[#94D91E] dark:bg-tribe-green-light dark:hover:bg-[#94D91E] text-[#272D34] dark:text-[#272D34] font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            {lang === 'es' ? 'Alojar una sesión aquí' : 'Host a Session Here'} →
          </button>
        </div>
      </div>
    </Link>
  );
}
