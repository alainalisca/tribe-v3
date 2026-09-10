'use client';
import { useState } from 'react';
import { formatTime12Hour } from '@/lib/utils';
import { detectNeighborhood, getNearestNeighborhood } from '@/lib/city-config';
import { formatSessionLocationShortParts } from '@/lib/sessionLocation';
import { resolveSessionGym } from '@/lib/sessionGym';
import { HeroGymSlot } from '@/components/partner/SessionGymBits';
import SessionCardPresenter from '@/components/session/SessionCardPresenter';
import SessionCardLocation from '@/components/session/SessionCardLocation';
import { useUserCurrency } from '@/lib/useUserCurrency';
import { formatPriceForUser } from '@/lib/userCurrency';
import type { Currency } from '@/lib/payments/config';
import { getSessionHeroImage } from '@/lib/sport-images';

import { Calendar } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { translateSport } from '@/lib/translations';
import AvatarStack from '@/components/AvatarStack';
import type { AvatarStackParticipant } from '@/components/AvatarStack';
import { Card, CardContent } from '@/components/ui/card';
import { computeSessionStatus } from './SessionCardHelpers';
import type { SessionCardProps } from './SessionCardHelpers';
import { shareSession as shareSessionFn } from '@/lib/share';
import ShareButton from '@/components/ShareButton';
import SessionCardHero from '@/components/SessionCardHero';
import PhotoLightbox from '@/components/PhotoLightbox';
import { useTranslations } from '@/lib/i18n/useTranslations';
import SessionCardCreatorMenu from '@/components/session/SessionCardCreatorMenu';
import SessionMetaBadges from '@/components/session/SessionMetaBadges';
import { useCardPhotos } from '@/hooks/useCardPhotos';
import { useRouter } from 'next/navigation';

/** Date locale per UI language. A lookup, so no `language === 'es'` ternary is needed. */
const DATE_LOCALE: Record<'en' | 'es', string> = { en: 'en-US', es: 'es-CO' };

/** Case- and accent-insensitive containment: "does the address already name the barrio". */
function looselyContains(haystack: string, needle: string): boolean {
  const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return strip(haystack).includes(strip(needle));
}

/**
 * First and last name only.
 *
 * The title carries the instructor's name now, and "Boxeo con Salomon Tabares
 * Adarve" wraps to two lines on a phone while saying no more than "Boxeo con
 * Salomon Tabares".
 */
function shortName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
}

export default function SessionCard({
  session,
  onEdit,
  onDelete,
  onShare: _onShareLegacy, // deprecated: kept for callsite compat, internal share uses lib/share
  distance,
  liveData,
  sessionPartner,
  creatorPartner,
  partnerCoachCount = 0,
  currentUserId,
  featuredPartnerUserIds,
  priority = false,
  recapPhotos,
}: SessionCardProps) {
  const { language } = useLanguage();
  const tCard = useTranslations('sessionCard');
  const { currency: userCurrency } = useUserCurrency();
  const { isPast, isFull, isStartingSoon, confirmedParticipants } = computeSessionStatus(session);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const router = useRouter();

  // Detected neighborhood — used for the share-button payload and the
  // little inline neighborhood badge next to the location label.
  const sessionHood =
    session.location_lat && session.location_lng
      ? detectNeighborhood(session.location_lat, session.location_lng) ||
        getNearestNeighborhood(session.location_lat, session.location_lng)
      : null;

  // Short, deduped address. The detail page keeps the full string. Google
  // repeats the barrio and city on Medellin addresses and 45 live sessions
  // carry the repeat; see lib/sessionLocation.ts.
  // T-GYM1; the rules live in lib/sessionGym.ts.
  const gym = resolveSessionGym({
    sessionPartner,
    sessionPartnerStatus: session.partner_status ?? null,
    creatorPartner,
    creatorId: session.creator_id ?? session.creator?.id ?? null,
    viewerId: currentUserId ?? null,
  });

  // Venue name leads the address, bolded and de-duplicated against the street.
  const { venue: venueName, address: displayLocation } = formatSessionLocationShortParts(
    session.location,
    session.location_lat ?? null,
    session.location_lng ?? null,
    language,
    gym.venue?.business_name ?? null
  );

  const sportName = translateSport(session.sport, language);

  const spotsLeft = session.max_participants - confirmedParticipants.length;
  const isFree = !session.price_cents;
  const fillingFast = confirmedParticipants.length >= session.max_participants * 0.7 && !isPast && !isFull;

  const heroImage = getSessionHeroImage(session.sport, session.photos, session.creator?.banner_url);

  const instructorName = session.creator?.name ?? '';
  const cardTitle = session.title || `${sportName} ${tCard('with')} ${shortName(instructorName)}`.trim();

  const dateLine = `${new Date(session.date + 'T00:00:00').toLocaleDateString(DATE_LOCALE[language], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} · ${formatTime12Hour(session.start_time)}${
    session.duration ? ` · ${tCard('minutesShort', { count: session.duration })}` : ''
  }`;

  // Urgency badge: priority order. The hero owns the colour, keyed off type.
  const urgencyBadge: { text: string; type: 'starting_soon' | 'full' | 'spots_left' | 'filling_up' } | null =
    isStartingSoon && !isPast && !isFull
      ? { text: `🔥 ${tCard('startingSoon')}`, type: 'starting_soon' }
      : isFull && !isPast
        ? { text: tCard('full'), type: 'full' }
        : spotsLeft <= 3 && spotsLeft > 0 && !isPast
          ? { text: tCard('spotsLeft', { count: spotsLeft }), type: 'spots_left' }
          : fillingFast
            ? { text: `🔥 ${tCard('fillingUp')}`, type: 'filling_up' }
            : null;

  // Every photo this card can show: the session's own, then the instructor's
  // recent recap photos, then the banner only if nothing else exists.
  const photos = useCardPhotos({
    sessionId: session.id,
    sessionPhotos: session.photos,
    recapPhotos,
    bannerUrl: session.creator?.banner_url ?? null,
    fallbackSrc: heroImage,
  });
  const canExpand = heroImage.startsWith('/images/') || heroImage.startsWith('http');

  const sessionsHosted = session.creator?.total_sessions_hosted ?? 0;

  return (
    <div className="relative" onKeyDown={photos.onKeyDown}>
      <Card
        className={`bg-theme-card shadow-none hover:shadow-md transition-shadow duration-200 overflow-hidden ${
          featuredPartnerUserIds && session.creator_id && featuredPartnerUserIds.has(session.creator_id)
            ? 'border-tribe-green/40'
            : 'border-theme'
        }`}
      >
        {/* Whole-card link, as an overlay rather than a wrapper: a <button>
            inside an <a> is invalid HTML and breaks keyboard and screen-reader
            behaviour. The overlay still gets prefetch, middle-click,
            open-in-new-tab, a focus ring and Enter. Controls sit above it. */}
        <Link
          href={`/session/${session.id}`}
          aria-label={`${cardTitle}, ${dateLine}`}
          className="absolute inset-0 z-[1] rounded-xl focus-visible:ring-2 focus-visible:ring-tribe-green focus-visible:ring-offset-2"
        >
          <span className="sr-only">{tCard('openSession')}</span>
        </Link>

        <SessionCardHero
          sport={session.sport}
          sportName={sportName}
          heroImage={heroImage}
          imageAlt={cardTitle}
          urgencyLabel={urgencyBadge?.text}
          urgencyType={urgencyBadge?.type ?? null}
          onExpand={
            canExpand
              ? () => {
                  photos.onExpand();
                  setLightboxOpen(true);
                }
              : undefined
          }
          photos={photos.photos}
          onTap={() => router.push(`/session/${session.id}`)}
          onIndexChange={photos.onIndexChange}
          controlsRef={photos.controlsRef}
          topLeftSlot={<HeroGymSlot gym={gym} />}
          liveCount={liveData?.count ?? 0}
          liveLabel={tCard('live')}
          eager={priority}
          shareButton={
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
              className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 border-0 rounded-full"
            />
          }
          actions={
            currentUserId && session.creator_id === currentUserId ? (
              <SessionCardCreatorMenu sessionId={session.id} onEdit={onEdit} onDelete={onDelete} />
            ) : null
          }
        />

        <CardContent className="p-4 space-y-2.5">
          {/* Title */}
          <h3 className="text-base font-bold text-theme-primary leading-snug line-clamp-2">{cardTitle}</h3>

          {/* Date + Time */}
          <div className="flex items-center text-sm text-theme-secondary">
            <Calendar className="w-3.5 h-3.5 mr-1.5 text-tribe-green flex-shrink-0" />
            <span>{dateLine}</span>
          </div>

          <SessionCardLocation
            venueName={venueName}
            address={displayLocation}
            neighborhood={sessionHood && !looselyContains(displayLocation, sessionHood.name) ? sessionHood.name : null}
            distance={distance}
          />

          <SessionMetaBadges genderPreference={session.gender_preference} skillLevel={session.skill_level} />

          {/* Instructor + Price. No name text: the title already carries it. */}
          <div className="flex items-center justify-between pt-1">
            <SessionCardPresenter
              gym={gym}
              creator={session.creator ?? null}
              instructorName={instructorName}
              sessionsHosted={sessionsHosted}
              coachCount={partnerCoachCount}
              tCard={tCard}
            />

            <span className={`text-sm font-bold ${isFree ? 'text-tribe-green' : 'text-theme-primary'}`}>
              {isFree
                ? tCard('free')
                : session.price_cents
                  ? formatPriceForUser(session.price_cents, (session.currency || 'COP') as Currency, userCurrency)
                  : `$0 ${session.currency || 'COP'}`}
            </span>
          </div>

          {/* Avatar stack + capacity. z-[2] so its profile links beat the overlay. */}
          {confirmedParticipants.length > 0 && (
            <div className="relative z-[2] flex items-center justify-between pt-1 border-t border-theme">
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
              <span className="text-xs text-theme-tertiary">
                {confirmedParticipants.length}/{session.max_participants} {tCard('athletes')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feed lightbox. Closing just clears local state: the detail page's
          history.back() pattern belongs to its pushState flow and would
          navigate the athlete away from the feed. */}
      {lightboxOpen && (
        <PhotoLightbox
          photos={photos.lightboxPhotos}
          initialIndex={photos.lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
