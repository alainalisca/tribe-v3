'use client';
import { formatTime12Hour } from "@/lib/utils";

import { Calendar, Clock, MapPin, Users, Share2, MessageCircle, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

interface SessionCardProps {
  session: any;
  onShare?: (session: any) => void;
  distance?: string;
}

export default function SessionCard({ session, onShare, distance }: SessionCardProps) {
  const { t, language } = useLanguage();
  const isPast = new Date(session.date) < new Date();
  const isFull = session.current_participants >= session.max_participants;
  const isStartingSoon = !isPast && (() => {
    const sessionDateTime = new Date(`${session.date}T${session.start_time}`);
    const now = new Date();
    const diffMs = sessionDateTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours > 0 && diffHours <= 2;
  })();
  const confirmedParticipants = session.session_participants?.filter(
    (p: any) => p.status === 'confirmed'
  ) || [];

  const sportName = language === 'es' && sportTranslations[session.sport]
    ? sportTranslations[session.sport].es
    : session.sport;

  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (onShare) {
      onShare(session);
    }
  }

  return (
    <div onClick={() => window.location.href = `/session/${session.id}`} className="cursor-pointer">
      <div className="bg-white dark:bg-[#6B7178] rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-stone-200 dark:border-[#52575D]">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 flex items-center gap-2">
              <span className="inline-block px-4 py-2 bg-tribe-green text-slate-900 rounded-full text-sm font-bold">
                {sportName}
              </span>
              
              {/* Photo indicator badge */}
              {session.photos && session.photos.length > 0 && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold flex items-center gap-1">
                  <span className="font-bold">📍</span>
                  {session.photos.length}
                </span>
              )}

              {isPast && (
                <span className="px-3 py-1 bg-gray-300 text-gray-700 rounded-full text-xs font-semibold">
                  {t('ended')}
                </span>
              )}
              {isFull && !isPast && (
                <span className="px-3 py-1 bg-red-500 text-white rounded-full text-xs font-semibold">
                  {t('full')}
                </span>
              )}
              {isStartingSoon && !isPast && !isFull && (
                <span className="px-3 py-1 bg-orange-500 text-white rounded-full text-xs font-semibold animate-pulse">
                  🔥 {language === 'es' ? 'PRONTO' : 'STARTING SOON'}
                </span>
              )}
            </div>

            <button
              onClick={handleShare}
              className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded-lg transition-colors"
            >
              <Share2 className="w-5 h-5 text-stone-600 dark:text-[#E0E0E0]" />
            </button>
          </div>

          {/* Participant Info */}
          <div className="flex items-center justify-between text-stone-700 dark:text-[#E0E0E0] mb-4">
            <div className="flex items-center">
              <Users className="w-5 h-5 mr-2 text-tribe-green" />
              <span className="font-semibold">
                {confirmedParticipants.length}/{session.max_participants}
              </span>
            </div>
            <div className="flex-1 mx-4">
              <div className="h-2 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
                <div 
                  className={`h-full ${isFull ? 'bg-red-500' : 'bg-tribe-green'}`}
                  style={{ width: `${(confirmedParticipants.length / session.max_participants) * 100}%` }}
                />
              </div>
            </div>
            <span className="text-sm text-stone-600 dark:text-[#B1B3B6]">
              {session.max_participants - confirmedParticipants.length} {t('spotsLeft')}
            </span>
          </div>

          {/* Date & Time */}
          <div className="space-y-2 mb-4">
            <div className="flex items-center text-stone-900 dark:text-white">
              <Calendar className="w-4 h-4 mr-2 text-tribe-green" />
              <span className="text-sm font-medium">
                {new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}
              </span>
            </div>

            <div className="flex items-center text-stone-900 dark:text-white">
              <Clock className="w-4 h-4 mr-2 text-tribe-green" />
              <span className="text-sm">
                {formatTime12Hour(session.start_time)} • {session.duration} {language === 'es' ? 'min' : 'min'}
              </span>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-start mb-3">
            <MapPin className="w-4 h-4 mr-2 mt-0.5 text-tribe-green flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-stone-900 dark:text-white break-words">
                {session.location}
              </span>
              {distance && (
                <span className="ml-2 px-2 py-0.5 bg-tribe-green text-slate-900 rounded-full text-xs font-semibold">
                  {distance} {language === 'es' ? 'de distancia' : 'away'}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {session.description && (
            <p className="text-sm text-stone-700 dark:text-[#E0E0E0] mt-2 line-clamp-2">
              {session.description}
            </p>
          )}

          {/* Creator with Thumbnail */}
          {session.creator && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-6 h-6 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-xs">
                {session.creator.avatar_url ? (
                  <img src={session.creator.avatar_url} alt={session.creator.name} className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  session.creator.name?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <p className="text-xs text-stone-500 dark:text-[#B1B3B6]">
                {t('hostedBy')} {session.creator.name}
              </p>
            </div>
          )}

          {/* Participants Avatars */}
          {confirmedParticipants.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex -space-x-2">
                {confirmedParticipants.slice(0, 5).map((p: any, idx: number) => (
                  <Link key={idx} href={`/profile/${p.user_id}`}>
                    <div 
                      className="w-8 h-8 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-xs border-2 border-white dark:border-[#6B7178] hover:z-10 transition-transform hover:scale-110"
                      title={p.user?.name}
                    >
                      {p.user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  </Link>
                ))}
              </div>
              {confirmedParticipants.length > 5 && (
                <span className="text-xs text-stone-600 dark:text-[#B1B3B6]">
                  +{confirmedParticipants.length - 5} {language === 'es' ? 'más' : 'more'}
                </span>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 py-2 bg-tribe-green text-slate-900 rounded-lg font-semibold hover:bg-lime-500 transition-colors text-sm"
              onClick={(e) => {
                e.preventDefault();
                window.location.href = `/session/${session.id}`;
              }}
            >
              {t('viewDetails')}
            </button>
            <Link 
              href={`/session/${session.id}/chat`}
              onClick={(e) => e.stopPropagation()}
              className="px-4 py-2 bg-stone-100 dark:bg-[#52575D] rounded-lg hover:bg-stone-200 dark:hover:bg-[#404549] transition-colors flex items-center justify-center"
            >
              <MessageCircle className="w-5 h-5 text-stone-700 dark:text-[#E0E0E0]" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
