'use client';

import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CardPhoto } from '@/lib/sessionPhotos';
import SmartPhoto from '@/components/session/SmartPhoto';
import { useCarouselIndex } from '@/hooks/useCarouselIndex';
import { useInView } from '@/hooks/useInView';
import { useTranslations } from '@/lib/i18n/useTranslations';

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

/** A tap is a press that barely moved. Beyond this it was a swipe or a drag. */
const TAP_SLOP_PX = 8;

/**
 * Whether this pointer should drag the track.
 *
 * A native scroll container ignores mouse drag entirely: touch gets momentum
 * scrolling for free, a mouse gets nothing, which is why the carousel felt
 * broken on desktop while working on a phone.
 *
 * Gated on the pointer being a mouse rather than a global media query, so a
 * hybrid laptop keeps native touch scrolling for its touchscreen and gets drag
 * for its trackpad. The matchMedia check mirrors the hover/fine rule the
 * chevrons use, for browsers that report a coarse mouse.
 */
function isDragPointer(e: React.PointerEvent): boolean {
  if (e.pointerType !== 'mouse') return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
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

  // Tap versus swipe is pointer movement, not timing: a press that barely moved
  // opens the session, anything further was the athlete scrolling the strip.
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  /** Mouse-drag bookkeeping. Null whenever a drag is not eligible or active. */
  const dragRef = useRef<{ startX: number; startScrollLeft: number; pointerId: number } | null>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  function endDrag() {
    dragRef.current = null;
    draggingRef.current = false;
    setDragging(false);
  }

  function handlePointerDown(e: React.PointerEvent) {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;

    const track = trackRef.current;
    if (!track || !isDragPointer(e) || photos.length < 2) return;
    dragRef.current = { startX: e.clientX, startScrollLeft: track.scrollLeft, pointerId: e.pointerId };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const start = pointerStart.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > TAP_SLOP_PX || Math.abs(e.clientY - start.y) > TAP_SLOP_PX) {
      movedRef.current = true;
    }

    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track) return;

    const dx = e.clientX - drag.startX;
    // Only take over once past the tap threshold, so a click that wobbles a
    // pixel still opens the session.
    if (!draggingRef.current) {
      if (Math.abs(dx) <= TAP_SLOP_PX) return;
      draggingRef.current = true;
      setDragging(true);
      try {
        track.setPointerCapture(drag.pointerId);
      } catch {
        // Capture is a nicety: without it a fast drag that leaves the element
        // stops early. Not worth failing the gesture over.
      }
    }

    // Suppress text selection and the browser's drag ghost mid-drag.
    e.preventDefault();
    track.scrollLeft = drag.startScrollLeft - dx;
  }

  function handlePointerUp() {
    const track = trackRef.current;
    const drag = dragRef.current;

    if (draggingRef.current && track) {
      // Land on the nearest photo, matching what scroll-snap does for touch.
      const width = track.clientWidth || 1;
      const nearest = Math.max(0, Math.min(photos.length - 1, Math.round(track.scrollLeft / width)));
      if (drag) {
        try {
          track.releasePointerCapture(drag.pointerId);
        } catch {
          // Already released, or never captured.
        }
      }
      endDrag();
      track.scrollTo({ left: nearest * width, behavior: 'smooth' });
      pointerStart.current = null;
      return;
    }

    if (pointerStart.current && !movedRef.current) onTap?.();
    endDrag();
    pointerStart.current = null;
  }

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          endDrag();
          pointerStart.current = null;
        }}
        onDragStart={(e) => e.preventDefault()}
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
                className="hero-zoom-img transition-transform duration-300 ease-out"
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
            className="hero-zoom-hint absolute left-1 top-1/2 -translate-y-1/2 z-10 min-w-[40px] min-h-[40px] hidden md:flex items-center justify-center opacity-0 transition-opacity duration-200"
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
            className="hero-zoom-hint absolute right-1 top-1/2 -translate-y-1/2 z-10 min-w-[40px] min-h-[40px] hidden md:flex items-center justify-center opacity-0 transition-opacity duration-200"
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
