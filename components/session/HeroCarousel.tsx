'use client';

import { useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CardPhoto } from '@/lib/sessionPhotos';
import SmartPhoto from '@/components/session/SmartPhoto';
import { useCarouselIndex } from '@/hooks/useCarouselIndex';
import { useInView } from '@/hooks/useInView';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { usePointerDragScroll } from '@/hooks/usePointerDragScroll';

/** Lets a parent drive the track (arrow keys on the card's overlay link). */
export interface CarouselControls {
  scrollBySlides: (delta: number) => void;
}

interface HeroCarouselProps {
  photos: CardPhoto[];
  alt: string;
  /** Slide 0 loads eagerly for the first cards in the feed. */
  eagerFirst?: boolean;
  onIndexChange?: (index: number, method: 'swipe' | 'arrow' | 'key') => void;
  /** A tap, as opposed to a swipe, opens the session. */
  onTap?: () => void;
  /** Overlay layer: gradient, badges, action buttons. Rendered once, above the track. */
  children?: React.ReactNode;
  controlsRef?: React.MutableRefObject<CarouselControls | null>;
}

/**
 * The swipeable photo strip behind a session card.
 *
 * Native CSS scroll-snap rather than a carousel library: it keeps iOS momentum
 * scrolling, behaves inside Capacitor, and adds nothing to the bundle.
 *
 * Uncontrolled by design. The index is reported upward but not accepted as a
 * prop — driving a native scroll container from React state fights the user's
 * own momentum scroll and produces a fight over scrollLeft mid-gesture.
 */
export default function HeroCarousel({
  photos,
  alt,
  eagerFirst = false,
  onIndexChange,
  onTap,
  children,
  controlsRef,
}: HeroCarouselProps) {
  const t = useTranslations('sessionCard');
  const methodRef = useRef<'swipe' | 'arrow' | 'key'>('swipe');

  const handleIndexChange = useCallback(
    (next: number) => {
      onIndexChange?.(next, methodRef.current);
      methodRef.current = 'swipe';
    },
    [onIndexChange]
  );

  const { trackRef, index, hasScrolled, scrollBySlides } = useCarouselIndex(photos.length, handleIndexChange);
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>();

  const move = useCallback(
    (delta: number, method: 'arrow' | 'key') => {
      methodRef.current = method;
      scrollBySlides(delta);
    },
    [scrollBySlides]
  );

  if (controlsRef) {
    controlsRef.current = { scrollBySlides: (delta: number) => move(delta, 'key') };
  }

  // Drag, tap-vs-drag and snap-on-release come from the shared hook (T-UI4,
  // extracted when the featured-partner banner needed the same behaviour).
  const { dragging, handlers } = usePointerDragScroll({
    trackRef,
    count: photos.length,
    onTap: () => onTap?.(),
  });

  const multiple = photos.length > 1;
  // Slide 0 always mounts. Later slides wait until the card is near the
  // viewport, and slides past 1 until the athlete has actually scrolled, so a
  // feed page never requests six photos per card up front.
  const isSlideActive = (i: number) => i === 0 || (inView && i === 1) || (hasScrolled && i > 1);

  return (
    <div ref={inViewRef} className="absolute inset-0">
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={t('photos')}
        {...handlers}
        className={`carousel-track absolute inset-0 z-[2] flex overflow-x-auto snap-x snap-mandatory scroll-smooth ${
          multiple ? 'md:cursor-grab' : ''
        } ${dragging ? 'is-dragging select-none md:cursor-grabbing' : ''}`}
      >
        {photos.map((photo, i) => (
          <div
            key={`${photo.src}-${i}`}
            role="group"
            aria-label={t('photoOfTotal', { index: i + 1, total: photos.length })}
            className="relative w-full h-full flex-shrink-0 snap-start overflow-hidden bg-theme-inset"
          >
            {isSlideActive(i) && (
              <SmartPhoto
                src={photo.src}
                alt={i === 0 ? alt : ''}
                eager={i === 0 && eagerFirst}
                /* T-VID1: the video preview applies to slide 0 only, and should
                   pause whenever the reported index is not 0. */
                className="transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.03]"
              />
            )}
          </div>
        ))}
      </div>

      {/* Overlay: fixed while the slides move underneath. */}
      {children}

      {multiple && (
        <>
          <span className="pointer-events-none absolute top-3 left-3 z-10 bg-black/55 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
            {t('photoCounter', { index: index + 1, total: photos.length })}
          </span>

          <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1">
            {photos.map((photo, i) => (
              <span
                key={`dot-${photo.src}-${i}`}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === index ? 'w-[18px] bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>

          {/* Chevrons are hover-only, so they never appear on touch. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              move(-1, 'arrow');
            }}
            aria-label={t('previousPhoto')}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 min-w-[40px] min-h-[40px] hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200"
          >
            <span className="w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              move(1, 'arrow');
            }}
            aria-label={t('nextPhoto')}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 min-w-[40px] min-h-[40px] hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200"
          >
            <span className="w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </span>
          </button>
        </>
      )}
    </div>
  );
}
