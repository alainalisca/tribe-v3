'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { getSportGradient } from '@/lib/sport-images';
import { useTranslations } from '@/lib/i18n/useTranslations';
import SmartPhoto from '@/components/session/SmartPhoto';
import HeroCarousel from '@/components/session/HeroCarousel';
import type { CarouselControls } from '@/components/session/HeroCarousel';
import type { CardPhoto } from '@/lib/sessionPhotos';

export interface SessionCardHeroProps {
  sport: string;
  /** Already-translated sport label for the pill. */
  sportName: string;
  /** Resolved hero source: session photo, instructor banner, or sport image. */
  heroImage: string;
  imageAlt: string;
  urgencyLabel?: string | null;
  urgencyType?: 'starting_soon' | 'full' | 'spots_left' | 'filling_up' | 'ended' | null;
  /** Renders the expand button and the hover hint. Omitted for gradient-only cards. */
  onExpand?: () => void;
  /** Top-right slot, rendered after share and expand (creator edit/delete menu). */
  actions?: React.ReactNode;
  /** Share control, rendered first in the top-right cluster. */
  shareButton?: React.ReactNode;
  /** Renders the LIVE pill top-left when greater than zero. */
  liveCount?: number;
  liveLabel?: string;
  /** First cards in the feed load eagerly at high priority. */
  eager?: boolean;
  /**
   * Every photo this card can show. Two or more turns the hero into a
   * carousel; zero or one keeps the single-image path.
   */
  photos?: CardPhoto[];
  /** A tap on a carousel slide, as opposed to a swipe. */
  onTap?: () => void;
  onIndexChange?: (index: number, method: 'swipe' | 'arrow' | 'key') => void;
  controlsRef?: React.MutableRefObject<CarouselControls | null>;
}

/**
 * The one hero implementation for session cards.
 *
 * Ratio is 4:3 on phones and 3:2 from md up. A 16:9 strip cropped phone
 * portraits so hard that most of the photo was lost; see SmartPhoto for how
 * portrait and landscape are each handled inside the box.
 *
 * Only an image gets the expand affordances. A gradient has nothing to expand,
 * so onExpand is simply not passed for those cards.
 */
export default function SessionCardHero({
  sport,
  sportName,
  heroImage,
  imageAlt,
  urgencyLabel,
  urgencyType,
  onExpand,
  actions,
  shareButton,
  liveCount = 0,
  liveLabel,
  eager = false,
  photos,
  onTap,
  onIndexChange,
  controlsRef,
}: SessionCardHeroProps) {
  const t = useTranslations('sessionCard');
  const [imageError, setImageError] = useState(false);

  // Same guard the inline hero used: only render an <img> for something that
  // is actually fetchable.
  const hasImage = !imageError && (heroImage.startsWith('/images/') || heroImage.startsWith('http'));
  const showExpand = Boolean(onExpand) && hasImage;
  // One photo is not a carousel. 143 of 311 sessions carry exactly one, and
  // wrapping those in a scroll container would trade the card's link
  // semantics for tap detection and gain nothing.
  const carouselPhotos = photos ?? [];
  const useCarousel = carouselPhotos.length > 1 && !imageError;

  // 'ended' is representable but currently unreachable: the feed drops finished
  // sessions and no history surface renders this card yet. It gets a neutral
  // slate so a future history surface has a correct default rather than an
  // urgent-looking amber. The grayscale/opacity treatment from the ticket is
  // deliberately not built until something can actually show it.
  const urgencyColorClass =
    urgencyType === 'starting_soon'
      ? 'bg-orange-500 animate-pulse'
      : urgencyType === 'full'
        ? 'bg-red-500'
        : urgencyType === 'filling_up'
          ? 'bg-tribe-amber'
          : urgencyType === 'ended'
            ? 'bg-slate-600'
            : 'bg-amber-500';

  function handleExpand(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onExpand?.();
  }

  const overlay = (
    <>
      {/* Dark gradient for badge legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />

      {/* Desktop discoverability cue. Centred because the bottom corners are
          taken by the sport pill and the urgency badge. */}
      {showExpand && (
        <button
          onClick={handleExpand}
          tabIndex={-1}
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm text-white text-[13px] font-semibold px-3.5 py-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          {t('viewPhoto')}
        </button>
      )}

      {/* Top-right cluster: share, expand, creator menu */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        {shareButton}
        {showExpand && (
          <button
            onClick={handleExpand}
            aria-label={t('expandPhoto')}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 rounded-full transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
        {actions}
      </div>

      {/* Bottom overlay: sport badge + urgency */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between z-10">
        <span className="px-3 py-1.5 bg-tribe-green text-slate-900 rounded-full text-xs font-bold uppercase tracking-wide shadow-lg">
          {sportName}
        </span>

        {urgencyLabel && (
          <span className={`px-3 py-1.5 text-white rounded-full text-xs font-bold shadow-lg ${urgencyColorClass}`}>
            {urgencyLabel}
          </span>
        )}
      </div>

      {/* Live indicator. Shifted right when the carousel counter also sits
          top-left, so the two never overlap. */}
      {liveCount > 0 && (
        <div className={`absolute top-3 z-10 ${useCarousel ? 'left-[4.25rem]' : 'left-3'}`}>
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500 text-white rounded-full text-xs font-bold animate-pulse shadow-lg">
            <span className="w-2 h-2 bg-white rounded-full" />
            {liveLabel}
          </span>
        </div>
      )}
    </>
  );

  return (
    <div className={`relative w-full aspect-[4/3] md:aspect-[3/2] overflow-hidden ${showExpand ? 'group' : ''}`}>
      {useCarousel ? (
        <HeroCarousel
          photos={carouselPhotos}
          alt={imageAlt}
          eagerFirst={eager}
          onTap={onTap}
          onIndexChange={onIndexChange}
          controlsRef={controlsRef}
        >
          {overlay}
        </HeroCarousel>
      ) : (
        <>
          {hasImage ? (
            <SmartPhoto
              src={heroImage}
              alt={imageAlt}
              eager={eager}
              onError={() => setImageError(true)}
              className="transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.03]"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${getSportGradient(sport)}`} />
          )}
          {overlay}
        </>
      )}
    </div>
  );
}
