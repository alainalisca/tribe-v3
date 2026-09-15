'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks which slide a scroll-snap track is showing.
 *
 * A rAF-throttled scroll listener rather than an IntersectionObserver per
 * slide: the maths is one division, it needs no per-slide refs, and it reports
 * the same answer during momentum scrolling on iOS where observer thresholds
 * fire unevenly.
 */
export function useCarouselIndex(slideCount: number, onIndexChange?: (index: number) => void) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // A separate flag rather than testing the rAF handle: a handle of 0 is
  // falsy/`!== null`-ambiguous, and conflating "pending" with "has an id"
  // silently drops every scroll after the first.
  const framePending = useRef(false);
  const frame = useRef<number | null>(null);
  /** Any scroll at all: the carousel uses it to start loading later slides. */
  const [hasScrolled, setHasScrolled] = useState(false);

  // Mirrors `index` so the scroll handler can compare without reading state,
  // and so the callback fires outside the setState updater. Updaters must stay
  // pure: React is free to run them more than once or defer them, which drops
  // or duplicates the analytics event.
  const indexRef = useRef(0);

  const read = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const next = Math.max(0, Math.min(slideCount - 1, Math.round(track.scrollLeft / track.clientWidth)));
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
    onIndexChange?.(next);
  }, [slideCount, onIndexChange]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function handleScroll() {
      setHasScrolled(true);
      if (framePending.current) return;
      framePending.current = true;
      frame.current = requestAnimationFrame(() => {
        framePending.current = false;
        frame.current = null;
        read();
      });
    }

    track.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', handleScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      framePending.current = false;
    };
  }, [read]);

  /** Move by whole slides, which is what the chevrons and arrow keys do. */
  const scrollBySlides = useCallback((delta: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: delta * track.clientWidth, behavior: 'smooth' });
  }, []);

  return { trackRef, index, hasScrolled, scrollBySlides };
}
