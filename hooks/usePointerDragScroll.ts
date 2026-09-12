'use client';

/**
 * Mouse-drag for a native scroll-snap track, plus tap-versus-drag (T-UI4).
 *
 * Extracted from HeroCarousel rather than copied, when the featured-partner
 * banner needed the same behaviour. The logic is subtle enough that two copies
 * would drift: the slop threshold, the pointer-capture try/catch, the
 * snap-to-nearest on release and the "did this move enough to not be a tap"
 * rule all have to agree, and getting one of them wrong produces a carousel
 * that opens a link every time you drag it.
 *
 * WHY IT EXISTS AT ALL: a native scroll container ignores mouse drag entirely.
 * Touch gets momentum scrolling for free; a mouse gets nothing, which is why
 * these carousels felt broken on desktop while working on a phone.
 */
import { useCallback, useRef, useState } from 'react';

/** A tap is a press that barely moved. Beyond this it was a swipe or a drag. */
const TAP_SLOP_PX = 8;

/**
 * Whether this pointer should drag the track.
 *
 * Gated on the pointer being a mouse rather than a global media query, so a
 * hybrid laptop keeps native touch scrolling for its touchscreen and gets drag
 * for its trackpad. The matchMedia check mirrors the hover/fine rule the
 * chevrons use, for browsers that report a coarse mouse.
 */
export function isDragPointer(e: React.PointerEvent): boolean {
  if (e.pointerType !== 'mouse') return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

interface Options {
  /** The scroll container. */
  trackRef: React.RefObject<HTMLElement | null>;
  /** Slide count. Fewer than two means nothing to drag. */
  count: number;
  /** Fired for a press that barely moved, i.e. a click rather than a drag. */
  onTap?: () => void;
}

export interface PointerDragScroll {
  /** True mid-drag, for cursor and select-none styling. */
  dragging: boolean;
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onDragStart: (e: React.DragEvent) => void;
  };
}

export function usePointerDragScroll({ trackRef, count, onTap }: Options): PointerDragScroll {
  // Tap versus swipe is pointer movement, not timing: a press that barely moved
  // is a click, anything further was a drag.
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  /** Mouse-drag bookkeeping. Null whenever a drag is not eligible or active. */
  const dragRef = useRef<{ startX: number; startScrollLeft: number; pointerId: number } | null>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    draggingRef.current = false;
    setDragging(false);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointerStart.current = { x: e.clientX, y: e.clientY };
      movedRef.current = false;

      const track = trackRef.current;
      if (!track || !isDragPointer(e) || count < 2) return;
      dragRef.current = { startX: e.clientX, startScrollLeft: track.scrollLeft, pointerId: e.pointerId };
    },
    [trackRef, count]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
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
      // pixel still counts as a click.
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
    },
    [trackRef]
  );

  const onPointerUp = useCallback(() => {
    const track = trackRef.current;
    const drag = dragRef.current;

    if (draggingRef.current && track) {
      // Land on the nearest slide, matching what scroll-snap does for touch.
      const width = track.clientWidth || 1;
      const nearest = Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / width)));
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
  }, [trackRef, count, onTap, endDrag]);

  const onPointerCancel = useCallback(() => {
    endDrag();
    pointerStart.current = null;
  }, [endDrag]);

  return {
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onDragStart: (e: React.DragEvent) => e.preventDefault(),
    },
  };
}
