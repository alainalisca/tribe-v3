'use client';
import { useState } from 'react';
import { formatTime12Hour } from '@/lib/utils';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';
import { getSessionHeroImage, getSportGradient } from '@/lib/sport-images';

import { Calendar, MapPin, Star, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import AvatarStack from '@/components/AvatarStack';
import type { AvatarStackParticipant } from '@/components/AvatarStack';
import { Card, CardContent } from '@/components/ui/card';
import { computeSessionStatus } from './SessionCardHelpers';
import type { SessionCardProps } from './SessionCardHelpers';
import { shareSession as shareSessionFn } from '@/lib/share';
import ShareButton from '@/components/ShareButton';

export default function SessionCard({
  session,
  onEdit,
  onDelete,
  onShare: _onShareLegacy, // deprecated: kept for callsite compat, internal share uses lib/share
  distance,
  liveData,
  currentUserId,
  featuredPartnerUserIds,
}: SessionCardProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const { isPast, isFull, isStartingSoon, confirmedParticipants } = computeSessionStatus(session);
  const [imageError, setImageError] = useState(false);
  const [showCreatorMenu, setShowCreatorMenu] = useState(false);
  const isCreator = Boolean(currentUserId && session.creator_id === currentUserId);

  const sessionHood =
    session.location_lat && session.location_lng
      ? detectNeighborhood(session.location_lat, session.location_lng) ||
        getNearestNeighborhood(session.location_lat, session.location_lng)
      : null;

  // Detect legacy sessions whose location field was saved as raw lat/lng
  // (e.g. "6.220661, -75.573718"). Replace with a human-readable fallback
  // so users never see raw coordinates in the feed.
  const RAW_COORDS_RE = /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/;
  const displayLocation =
    session.location && RAW_COORDS_RE.test(session.location.trim())
      ? sessionHood
        ? sessionHood.name
        : language === 'es'
          ? 'Ubicación en mapa'
          : 'Location on map'
      : session.location;

  const sportName =
    language === 'es' && sportTranslations[session.sport] ? sportTranslations[session.sport].es : session.sport;

  const spotsLeft = session.max_participants - confirmedParticipants.length;
  const isFree = !session.price_cents;
  const fillingFast = confirmedParticipants.length >= session.max_participants * 0.7 && !isPast && !isFull;

  const heroImage = getSessionHeroImage(session.sport, session.photos, (session.creator as any)?.banner_url);

  // Urgency badge: priority order
  const urgencyBadge =
    isStartingSoon && !isPast && !isFull
      ? { text: `🔥 ${language === 'es' ? 'Empieza pronto' : 'Starting soon'}`, color: 'bg-orange-500 animate-pulse' }
      : isFull && !isPast
        ? { text: language === 'es' ? 'Lleno' : 'Full', color: 'bg-red-500' }
        : spotsLeft <= 3 && spotsLeft > 0 && !isPast
          ? { text: `${spotsLeft} ${language === 'es' ? 'cupos' : 'spots left'}`, color: 'bg-amber-500' }
          : fillingFast
            ? { text: `🔥 ${language === 'es' ? 'Llenándose' : 'Filling up'}`, color: 'bg-tribe-amber' }
            : null;

  return (
    <div onClick={() => router.push(`/session/${session.id}`)} className="cursor-pointer">
      <Card
        className={`dark:bg-tribe-card shadow-none hover:shadow-md transition-shadow duration-200 overflow-hidden ${
          featuredPartnerUserIds && session.creator_id && featuredPartnerUserIds.has(session.creator_id)
            ? 'border-tribe-green/40'
            : 'border-stone-200 dark:border-gray-600/30'
        }`}
      >
        {/* Hero Image */}
        <div className="relative h-40 w-full overflow-hidden">
          {!imageError && (heroImage.startsWith('/images/') || heroImage.startsWith('http')) ? (
            <img
              src={heroImage}
              alt={session.sport}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${getSportGradient(session.sport)}`} />
          )}

          {/* Dark gradient for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />

          {/* Top-right actions: share + creator menu */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            <ShareButton
              size="sm"
              variant="icon"
              onShare={async () => {
                await shareSessionFn(
                  {
                    id: session.id,
                    title: session.sport,
                    sport: session.sport,
                    date: session.date,
                    time: session.start_time,
                    neighborhood: sessionHood?.name,
                    instructorName: session.creator?.name,
                  },
                  language
                );
                return null;
              }}
              className="bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 border-0 rounded-full"
            />

            {/* Creator-only edit/delete menu */}
            {isCreator && (onEdit || onDelete) && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCreatorMenu((prev) => !prev);
                  }}
                  aria-label={language === 'es' ? 'Opciones' : 'Options'}
                  className="p-1.5 bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 rounded-full transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showCreatorMenu && (
                  <>
                    {/* Backdrop to close menu on outside click */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowCreatorMenu(false);
                      }}
                    />
                    <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-tribe-surface rounded-lg shadow-xl border border-stone-200 dark:border-tribe-mid z-20 overflow-hidden">
                      {onEdit && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowCreatorMenu(false);
                            onEdit(session.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-gray-200 hover:bg-stone-100 dark:hover:bg-tribe-mid transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {language === 'es' ? 'Editar' : 'Edit'}
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowCreatorMenu(false);
                            onDelete(session.id);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-stone-100 dark:hover:bg-tribe-mid transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {language === 'es' ? 'Eliminar' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Bottom overlay: sport badge + urgency */}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-10">
            <span className="px-3 py-1.5 bg-tribe-green text-slate-900 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg">
              {sportName}
            </span>

            {urgencyBadge && (
              <span className={`px-3 py-1.5 text-white rounded-full text-xs font-bold shadow-lg ${urgencyBadge.color}`}>
                {urgencyBadge.text}
              </span>
            )}
          </div>

          {/* Live indicator */}
          {liveData && liveData.count > 0 && (
            <div className="absolute top-3 left-3 z-10">
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500 text-white rounded-full text-xs font-bold animate-pulse shadow-lg">
                <span className="w-2 h-2 bg-white rounded-full" />
                {language === 'es' ? 'EN VIVO' : 'LIVE'}
              </span>
            </div>
          )}
        </div>

        <CardContent className="p-4 space-y-2.5">
          {/* Title */}
          <h3 className="text-base font-bold text-stone-900 dark:text-white leading-snug line-clamp-2">
            {session.title || `${sportName} ${language === 'es' ? 'con' : 'with'} ${session.creator?.name || ''}`}
          </h3>

          {/* Date + Time */}
          <div className="flex items-center text-sm text-stone-600 dark:text-gray-400">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-tribe-green flex-shrink-0" />
            <span>
              {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
              {' · '}
              {formatTime12Hour(session.start_time)}
              {session.duration ? ` · ${session.duration} min` : ''}
            </span>
          </div>

          {/* Location */}
          <div className="flex items-center text-sm text-stone-600 dark:text-gray-400">
            <MapPin className="w-3.5 h-3.5 mr-1.5 text-tribe-green flex-shrink-0" />
            <span className="truncate">{displayLocation}</span>
            {sessionHood && displayLocation !== sessionHood.name && (
              <span className="ml-1.5 text-xs text-blue-400 font-medium flex-shrink-0">· {sessionHood.name}</span>
            )}
            {distance && (
              <span className="ml-1.5 text-xs text-tribe-green font-medium flex-shrink-0">· {distance}</span>
            )}
          </div>

          {/* Instructor + Price row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {session.creator && (
                <>
                  <Avatar className="w-6 h-6">
                    <AvatarImage loading="lazy" src={session.creator.avatar_url || undefined} />
                    <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-[10px]">
                      {session.creator.name?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-stone-500 dark:text-gray-400 font-medium">{session.creator.name}</span>
                  {Number(session.creator.average_rating) > 0 && (
                    <span className="text-xs text-yellow-500 font-semibold flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-yellow-500" />
                      {Number(session.creator.average_rating).toFixed(1)}
                    </span>
                  )}
                </>
              )}
            </div>

            <span className={`text-sm font-bold ${isFree ? 'text-tribe-green' : 'text-stone-900 dark:text-white'}`}>
              {isFree
                ? language === 'es'
                  ? 'Gratis'
                  : 'Free'
                : session.price_cents
                  ? `$${(session.price_cents / 100).toLocaleString()} ${session.currency || 'COP'}`
                  : `$0 ${session.currency || 'COP'}`}
            </span>
          </div>

          {/* Avatar stack + capacity */}
          {confirmedParticipants.length > 0 && (
            <div className="flex items-center justify-between pt-1 border-t border-stone-100 dark:border-tribe-mid">
              <AvatarStack
                participants={confirmedParticipants.map(
                  (p): AvatarStackParticipant => ({
                    user_id: p.user_id || p.user?.id || '',
                    name: p.user?.name || 'U',
                    avatar_url: p.user?.avatar_url ?? null,
                  })
                )}
                max={4}
                size="sm"
                linkToProfile
              />
              <span className="text-xs text-stone-500 dark:text-gray-400">
                {confirmedParticipants.length}/{session.max_participants} {language === 'es' ? 'atletas' : 'athletes'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
