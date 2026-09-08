'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { getSportGradient } from '@/lib/sport-images';
import { useTranslations } from '@/lib/i18n/useTranslations';
import SmartPhoto from '@/components/session/SmartPhoto';

export interface SessionCardHeroProps {
  sport: string;
  /** Already-translated sport label for the pill. */
  sportName: string;
  /** Resolved hero source: session photo, instructor banner, or sport image. */
  heroImage: string;
  imageAlt: string;
  urgencyLabel?: string | null;
  urgencyType?: 'starting_soon' | 'full' | 'spots_left' | 'filling_up' | null;
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
}: SessionCardHeroProps) {
  const t = useTranslations('sessionCard');
  const [imageError, setImageError] = useState(false);

  // Same guard the inline hero used: only render an <img> for something that
  // is actually fetchable.
  const hasImage = !imageError && (heroImage.startsWith('/images/') || heroImage.startsWith('http'));
  const showExpand = Boolean(onExpand) && hasImage;

  const urgencyColorClass =
    urgencyType === 'starting_soon'
      ? 'bg-orange-500 animate-pulse'
      : urgencyType === 'full'
        ? 'bg-red-500'
        : urgencyType === 'filling_up'
          ? 'bg-tribe-amber'
          : 'bg-amber-500';

  function handleExpand(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onExpand?.();
  }

  return (
    <div className={`relative w-full aspect-[4/3] md:aspect-[3/2] overflow-hidden ${showExpand ? 'hero-zoom' : ''}`}>
      {hasImage ? (
        <SmartPhoto
          src={heroImage}
          alt={imageAlt}
          eager={eager}
          onError={() => setImageError(true)}
          className="hero-zoom-img transition-transform duration-300 ease-out"
        />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${getSportGradient(sport)}`} />
      )}

      {/* Dark gradient for badge legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />

      {/* Desktop discoverability cue. Centred because the bottom corners are
          taken by the sport pill and the urgency badge. */}
      {showExpand && (
        <button
          onClick={handleExpand}
          tabIndex={-1}
          aria-hidden="true"
          className="hero-zoom-hint absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 bg-black/55 backdrop-blur-sm text-white text-[13px] font-semibold px-3.5 py-2 rounded-full opacity-0 transition-opacity duration-200"
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

      {/* Live indicator */}
      {liveCount > 0 && (
        <div className="absolute top-3 left-3 z-10">
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500 text-white rounded-full text-xs font-bold animate-pulse shadow-lg">
            <span className="w-2 h-2 bg-white rounded-full" />
            {liveLabel}
          </span>
        </div>
      )}
    </div>
  );
}
