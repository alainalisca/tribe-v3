'use client';
import { formatTime12Hour } from '@/lib/utils';

import { Calendar, Clock, MapPin, Users, Share2, MessageCircle, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getSkillLevelDisplay, getGenderDisplay, computeSessionStatus } from './SessionCardHelpers';
import type { SessionCardProps } from './SessionCardHelpers';

export default function SessionCard({ session, onShare, distance, liveData, currentUserId }: SessionCardProps) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { isPast, isFull, isStartingSoon, confirmedParticipants } = computeSessionStatus(session);

  const sportName =
    language === 'es' && sportTranslations[session.sport] ? sportTranslations[session.sport].es : session.sport;

  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (onShare) {
      onShare(session);
    }
  }

  return (
    <div onClick={() => router.push(`/session/${session.id}`)} className="cursor-pointer">
      <Card className="dark:bg-[#6B7178] shadow-none hover:shadow-sm transition-shadow duration-200 overflow-hidden border-stone-200 dark:border-[#52575D]">
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <span className="inline-block px-4 py-2 bg-tribe-green text-slate-900 rounded-full text-sm font-bold">
                {sportName}
              </span>

              {/* Skill level badge */}
              {session.skill_level &&
                (() => {
                  const skillLevel = getSkillLevelDisplay(session.skill_level, t);
                  return (
                    <Badge className={`px-2 py-1 rounded-full border-transparent ${skillLevel.color}`}>
                      {skillLevel.emoji} {skillLevel.label}
                    </Badge>
                  );
                })()}

              {/* Gender preference badge */}
              {session.gender_preference &&
                (() => {
                  const genderDisplay = getGenderDisplay(session.gender_preference, t);
                  if (!genderDisplay) return null;
                  return (
                    <Badge className={`px-2 py-1 rounded-full border-transparent ${genderDisplay.color}`}>
                      {genderDisplay.emoji} {genderDisplay.label}
                    </Badge>
                  );
                })()}

              {/* Photo indicator badge */}
              {session.photos && session.photos.length > 0 && (
                <Badge className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full border-transparent gap-1">
                  <span className="font-bold">📍</span>
                  {session.photos.length}
                </Badge>
              )}

              {isPast && (
                <Badge variant="secondary" className="px-3 py-1 rounded-full">
                  {t('ended')}
                </Badge>
              )}
              {isFull && !isPast && (
                <Badge variant="destructive" className="px-3 py-1 rounded-full border-transparent">
                  {t('full')}
                </Badge>
              )}
              {isStartingSoon && !isPast && !isFull && (
                <Badge className="px-3 py-1 bg-orange-500 text-white rounded-full border-transparent animate-pulse">
                  🔥 {t('startingSoon')}
                </Badge>
              )}
              {liveData && liveData.count > 0 && (
                <Badge variant="destructive" className="px-3 py-1 rounded-full border-transparent gap-1 animate-pulse">
                  <span className="w-2 h-2 bg-white rounded-full"></span>
                  {liveData.count} {t('live')}
                </Badge>
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
          <div className="flex items-center justify-between text-stone-700 dark:text-[#E0E0E0] mb-3">
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
          <div className="space-y-2 mb-3">
            <div className="flex items-center text-muted-foreground">
              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
              <span className="text-sm font-medium">
                {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>

            <div className="flex items-center text-muted-foreground">
              <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
              <span className="text-sm">
                {formatTime12Hour(session.start_time)} • {session.duration} {language === 'es' ? 'min' : 'min'}
              </span>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-start mb-2">
            <MapPin className="w-4 h-4 mr-2 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-muted-foreground break-words">{session.location}</span>
              {distance && (
                <Badge className="ml-2 bg-tribe-green text-slate-900 rounded-full border-transparent">
                  {distance} {t('away')}
                </Badge>
              )}
            </div>
          </div>

          {/* Equipment */}
          {session.equipment && (
            <div className="flex items-start mt-2">
              <span className="text-sm mr-2">🎒</span>
              <span className="text-sm text-muted-foreground">{session.equipment}</span>
            </div>
          )}

          {/* Description */}
          {session.description && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{session.description}</p>
          )}

          {/* Creator with Social Proof */}
          {session.creator && (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarImage
                      loading="lazy"
                      src={session.creator.avatar_url || undefined}
                      alt={session.creator.name || ''}
                    />
                    <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-xs">
                      {session.creator.name?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-xs text-stone-500 dark:text-[#B1B3B6]">
                    {t('hostedBy')} {session.creator.name}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {Number(session.creator.average_rating) > 0 && (
                    <Badge className="bg-yellow-100 text-yellow-800 rounded-full border-transparent gap-1">
                      <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                      <span>{Number(session.creator.average_rating).toFixed(1)}</span>
                      {Number(session.creator.total_reviews) > 0 && (
                        <span className="text-yellow-600 text-[10px]">({session.creator.total_reviews})</span>
                      )}
                    </Badge>
                  )}
                </div>
              </div>
              {/* Social proof stats */}
              {(Number(session.creator.total_reviews) > 0 || confirmedParticipants.length >= session.max_participants * 0.7) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {confirmedParticipants.length >= session.max_participants * 0.7 && !isPast && !isFull && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-[10px] font-semibold rounded-full">
                      🔥 {language === 'es' ? 'Llenándose rápido' : 'Filling up fast'}
                    </span>
                  )}
                  {Number(session.creator.total_reviews) >= 5 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-tribe-green/10 text-tribe-green text-[10px] font-semibold rounded-full">
                      ✓ {language === 'es' ? 'Instructor verificado por la comunidad' : 'Community-verified instructor'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Participants Avatars */}
          {confirmedParticipants.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <div className="flex -space-x-2">
                {confirmedParticipants.slice(0, 5).map((p, idx) => (
                  <Link key={idx} href={`/profile/${p.user_id}`}>
                    <Avatar
                      className="w-8 h-8 border-2 border-white dark:border-[#6B7178] hover:z-10 transition-transform hover:scale-110"
                      title={p.user?.name}
                    >
                      <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-xs">
                        {p.user?.name?.[0]?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                ))}
              </div>
              {confirmedParticipants.length > 5 && (
                <span className="text-xs text-stone-600 dark:text-[#B1B3B6]">
                  +{confirmedParticipants.length - 5} {t('more')}
                </span>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <Button
              className="flex-1 py-2 font-semibold text-sm"
              onClick={(e) => {
                e.preventDefault();
                router.push(`/session/${session.id}`);
              }}
            >
              {t('viewDetails')}
            </Button>
            {currentUserId &&
              (session.creator_id === currentUserId ||
                confirmedParticipants.some((p) => p.user_id === currentUserId)) && (
                <Link
                  href={`/session/${session.id}/chat`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-4 py-2 bg-stone-100 dark:bg-[#52575D] rounded-lg hover:bg-stone-200 dark:hover:bg-[#404549] transition-colors flex items-center justify-center"
                >
                  <MessageCircle className="w-5 h-5 text-stone-700 dark:text-[#E0E0E0]" />
                </Link>
              )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
