'use client';

import { useEffect } from 'react';

/**
 * useBodyScrollLock — lock document scroll while an overlay/modal is open.
 *
 * Why this exists: the app has ~10 hand-rolled `fixed inset-0` modals. On iOS
 * WKWebView, if the body stays scrollable while a modal is open, dragging the
 * modal (or overscrolling its inner content) pans the document behind it —
 * the "I can move the whole page around" symptom. Radix Dialog locks scroll
 * for free; the hand-rolled overlays need this.
 *
 * Implementation: the position:fixed + top:-scrollY technique (not just
 * overflow:hidden) because overflow:hidden alone doesn't stop the iOS
 * rubber-band. On unlock it restores the exact scroll position.
 *
 * Pass the modal's open state. No-ops when closed.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    if (typeof document === 'undefined') return;

    const scrollY = window.scrollY;
    const body = document.body;
    // Snapshot prior inline values so nested locks don't clobber each other.
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      width: body.style.width,
      top: body.style.top,
    };

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.top = `-${scrollY}px`;

    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.width = prev.width;
      body.style.top = prev.top;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
