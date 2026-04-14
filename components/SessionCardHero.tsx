'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { getSessionHeroImage, getSportGradient } from '@/lib/sport-images';

interface SessionCardHeroProps {
  sport: string;
  sportName: string;
  photos?: string[] | null;
  instructorBannerUrl?: string | null;
  /** Single urgency label to show, e.g. "Starting soon", "Full", "3 spots left" */
  urgencyLabel?: string | null;
  urgencyType?: 'starting_soon' | 'full' | 'spots_left' | null;
  onShare: (e: React.MouseEvent) => void;
}

export default function SessionCardHero({
  sport,
  sportName,
  photos,
  instructorBannerUrl,
  urgencyLabel,
  urgencyType,
  onShare,
}: SessionCardHeroProps) {
  const heroSrc = getSessionHeroImage(sport, photos, instructorBannerUrl);
  const gradient = getSportGradient(sport);
  const [imgError, setImgError] = useState(false);

  const urgencyColorClass =
    urgencyType === 'starting_soon'
      ? 'bg-orange-500 text-white animate-pulse'
      : urgencyType === 'full'
        ? 'bg-red-600 text-white'
        : 'bg-black/50 text-white backdrop-blur-sm';

  return (
    <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br">
      {/* Hero image or gradient fallback */}
      {!imgError ? (
        <img
          src={heroSrc}
          alt={sportName}
          loading="lazy"
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      )}

      {/* Darken overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

      {/* Share button — top right */}
      <button
        onClick={onShare}
        className="absolute top-2 right-2 p-2 bg-black/40 backdrop-blur-sm text-white rounded-full hover:bg-black/60 transition-colors z-10"
        aria-label="Share"
      >
        <Share2 className="w-4 h-4" />
      </button>

      {/* Bottom overlay: sport badge (left) + urgency (right) */}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-3 pb-2.5">
        {/* Sport badge */}
        <span className="inline-block px-3 py-1 bg-tribe-green text-slate-900 rounded-full text-xs font-bold">
          {sportName}
        </span>

        {/* Urgency badge */}
        {urgencyLabel && (
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${urgencyColorClass}`}>
            {urgencyLabel}
          </span>
        )}
      </div>
    </div>
  );
}
