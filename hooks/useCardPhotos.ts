'use client';

import { useCallback, useRef, useState } from 'react';
import { buildCardPhotos } from '@/lib/sessionPhotos';
import type { CardPhoto } from '@/lib/sessionPhotos';
import type { CarouselControls } from '@/components/session/HeroCarousel';
import { trackEvent } from '@/lib/analytics';

interface UseCardPhotosInput {
  sessionId: string;
  sessionPhotos?: string[] | null;
  recapPhotos?: string[] | null;
  bannerUrl?: string | null;
  /** The single resolved hero, used when there are no real photos at all. */
  fallbackSrc: string;
}

interface UseCardPhotosResult {
  photos: CardPhoto[];
  /** Sources for the lightbox, always at least one entry. */
  lightboxPhotos: string[];
  index: number;
  /** Clamped, so a shrinking list cannot open the lightbox out of range. */
  lightboxIndex: number;
  controlsRef: React.MutableRefObject<CarouselControls | null>;
  onIndexChange: (next: number, method: 'swipe' | 'arrow' | 'key') => void;
  onExpand: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Photo list, current slide and carousel analytics for one session card.
 *
 * Lives outside SessionCard so that file stays under the 300-line rule.
 */
export function useCardPhotos({
  sessionId,
  sessionPhotos,
  recapPhotos,
  bannerUrl,
  fallbackSrc,
}: UseCardPhotosInput): UseCardPhotosResult {
  const [index, setIndex] = useState(0);
  // Mirrors `index` so the callback stays outside the setState updater; see
  // useCarouselIndex for why updaters must stay pure here.
  const indexRef = useRef(0);
  const controlsRef = useRef<CarouselControls | null>(null);
  const swipeTracked = useRef(false);

  const photos = buildCardPhotos({ sessionPhotos, recapPhotos, bannerUrl });
  const lightboxPhotos = photos.length > 0 ? photos.map((p) => p.src) : [fallbackSrc];

  const onIndexChange = useCallback(
    (next: number, method: 'swipe' | 'arrow' | 'key') => {
      const prev = indexRef.current;
      if (prev === next) return;
      indexRef.current = next;
      setIndex(next);

      // One swipe event per card is the signal. A single flick through six
      // photos would otherwise post five events. Arrows and keys are
      // deliberate, so those always report.
      if (method !== 'swipe' || !swipeTracked.current) {
        if (method === 'swipe') swipeTracked.current = true;
        trackEvent('card_photo_swipe', { session_id: sessionId, from_index: prev, to_index: next, method });
      }
    },
    [sessionId]
  );

  const onExpand = useCallback(() => {
    trackEvent('card_photo_expand', { session_id: sessionId, index });
  }, [sessionId, index]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (photos.length < 2) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        controlsRef.current?.scrollBySlides(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        controlsRef.current?.scrollBySlides(1);
      }
    },
    [photos.length]
  );

  return {
    photos,
    lightboxPhotos,
    index,
    lightboxIndex: Math.min(index, Math.max(0, lightboxPhotos.length - 1)),
    controlsRef,
    onIndexChange,
    onExpand,
    onKeyDown,
  };
}
