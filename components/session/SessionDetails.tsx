'use client';

import { formatTime12Hour } from '@/lib/utils';
import { Calendar, Clock, MapPin, Users, Star } from 'lucide-react';
import LocationMap from '@/components/LocationMap';
import { Badge } from '@/components/ui/badge';
import type { Session } from '@/lib/database.types';
import { useLanguage } from '@/lib/LanguageContext';

interface CreatorInfo {
  id: string;
  name: string;
  avatar_url: string | null;
  average_rating: number | null;
  total_reviews: number | null;
}

interface ParticipantInfo {
  user_id: string | null;
  status: string | null;
  user?: { id: string; name: string; avatar_url: string | null } | null;
}

interface SessionDetailsProps {
  session: Session;
  creator: CreatorInfo | null;
  participants: ParticipantInfo[];
  isFull: boolean;
  language: 'en' | 'es';
  onOpenLightbox: (index: number, type: 'location' | 'recap') => void;
}

export default function SessionDetails({
  session,
  creator,
  participants,
  isFull,
  language,
  onOpenLightbox,
}: SessionDetailsProps) {
  const { t } = useLanguage();
  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="px-4 py-2 bg-tribe-green text-slate-900 rounded-full text-lg font-bold">
            {session.sport}
          </span>
          {session.skill_level && (
            <Badge
              className={`px-3 py-1 rounded-full text-sm border-transparent ${
                session.skill_level === 'beginner'
                  ? 'bg-green-100 text-green-800'
                  : session.skill_level === 'intermediate'
                    ? 'bg-blue-100 text-blue-800'
                    : session.skill_level === 'advanced'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-purple-100 text-purple-800'
              }`}
            >
              {session.skill_level === 'beginner'
                ? '🌱'
                : session.skill_level === 'intermediate'
                  ? '💪'
                  : session.skill_level === 'advanced'
                    ? '🔥'
                    : '🌟'}{' '}
              {session.skill_level === 'beginner'
                ? t('beginner')
                : session.skill_level === 'intermediate'
                  ? t('intermediate')
                  : session.skill_level === 'advanced'
                    ? t('advanced')
                    : t('allLevels')}
            </Badge>
          )}
          {session.gender_preference && session.gender_preference !== 'all' && (
            <Badge
              className={`px-3 py-1 rounded-full text-sm border-transparent ${
                session.gender_preference === 'women_only' ? 'bg-pink-100 text-pink-800' : 'bg-sky-100 text-sky-800'
              }`}
            >
              {session.gender_preference === 'women_only' ? '👩' : '👨'}{' '}
              {session.gender_preference === 'women_only' ? t('womenOnly') : t('menOnly')}
            </Badge>
          )}
        </div>
        <div className="text-right">
          <div className="text-stone-600 dark:text-gray-300 text-sm mb-1">
            {participants.length}/{session.max_participants} {t('joined')}
          </div>
          <div className="w-24 h-2 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
            <div
              className={`h-full ${isFull ? 'bg-red-500' : 'bg-tribe-green'}`}
              style={{ width: `${(participants.length / session.max_participants) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {session.photos && session.photos.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-tribe-green" />
            <p className="text-sm font-medium text-stone-700 dark:text-gray-300">{t('locationPhotos')}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {session.photos.map((photo: string, idx: number) => (
              <button
                key={idx}
                onClick={() => onOpenLightbox(idx, 'location')}
                className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 border-stone-200 hover:border-tribe-green transition active:scale-95"
              >
                <img loading="lazy" src={photo} alt={`Location ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        <div className="flex items-center text-stone-900 dark:text-white">
          <Calendar className="w-5 h-5 mr-3 text-stone-500 dark:text-gray-400" />
          <span className="font-medium">
            {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>

        <div className="flex items-center text-stone-900 dark:text-white">
          <Clock className="w-5 h-5 mr-3 text-stone-500 dark:text-gray-400" />
          <span>
            {formatTime12Hour(session.start_time)} • {session.duration} min
          </span>
        </div>

        <div className="flex items-start text-stone-900 dark:text-white">
          <MapPin className="w-5 h-5 mr-3 mt-0.5 text-stone-500 dark:text-gray-400" />
          <span>{session.location}</span>
        </div>

        {session.equipment && (
          <div className="flex items-start text-stone-900 dark:text-white">
            <span className="w-5 h-5 mr-3 mt-0.5 text-lg">🎒</span>
            <div>
              <p className="text-xs text-stone-500 dark:text-gray-400 mb-0.5">{t('equipmentNeeded')}</p>
              <span>{session.equipment}</span>
            </div>
          </div>
        )}

        <div className="mt-4">
          <LocationMap latitude={session.latitude} longitude={session.longitude} location={session.location} />
        </div>

        {creator && (
          <div className="flex items-center justify-between text-stone-900 dark:text-white">
            <div className="flex items-center">
              <Users className="w-5 h-5 mr-3 text-stone-500 dark:text-gray-400" />
              <span>
                {t('hostedBy')} {creator.name}
              </span>
            </div>
            {creator.average_rating && creator.average_rating > 0 && (
              <Badge className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm border-transparent gap-1">
                <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                <span>{Number(creator.average_rating).toFixed(1)}</span>
                {(creator.total_reviews ?? 0) > 0 && (
                  <span className="text-yellow-600 text-xs">({creator.total_reviews})</span>
                )}
              </Badge>
            )}
          </div>
        )}
      </div>

      {session.description && (
        <div className="mb-6 p-4 bg-stone-50 dark:bg-[#52575D] rounded-lg">
          <p className="text-stone-700 dark:text-gray-300">{session.description}</p>
        </div>
      )}
    </div>
  );
}
