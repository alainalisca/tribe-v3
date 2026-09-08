'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface PhotoLightboxProps {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}

/**
 * Full-screen photo viewer, shared by the session detail page and the home
 * feed session cards.
 *
 * Portalled to document.body on purpose: feed cards are wrapped in
 * AnimatedCard, a framer-motion div that carries a transform. A transformed
 * ancestor makes `position: fixed` resolve against that ancestor instead of
 * the viewport, so without the portal this would render clipped inside the
 * card. See components/AnimatedCard.tsx.
 *
 * Hand-rolled rather than built on Radix Dialog: Radix insists on owning the
 * body scroll lock, and the session detail page already runs its own
 * (position:fixed + scroll restore, in useSessionDetail.ts). Two owners fight
 * and the page jumps on close. The lock below deliberately yields instead.
 */
export default function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const t = useTranslations('lightbox');
  const tCommon = useTranslations('common');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Escape closes. onClose is called through a ref-free closure, so the
  // listener is re-bound if the parent hands us a new callback.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Body scroll lock, deliberately idempotent. The session detail page locks
  // the body itself (position:fixed + top offset) before rendering us; taking
  // a second lock there and releasing it on unmount would race its scroll
  // restore. When someone else already owns the lock we leave the body alone.
  useEffect(() => {
    const alreadyLocked = document.body.style.position === 'fixed';
    if (alreadyLocked) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Focus the close button on open, and hand focus back to whatever opened
  // us (the expand button on a card) when we go away.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < photos.length) setCurrentIndex(index);
    },
    [photos.length]
  );

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.targetTouches[0].clientX);
  }
  function handleTouchMove(e: React.TouchEvent) {
    setTouchEnd(e.targetTouches[0].clientX);
  }
  function handleTouchEnd() {
    const minSwipeDistance = 50;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) goTo(currentIndex + 1);
    if (distance < -minSwipeDistance) goTo(currentIndex - 1);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('label')}
      className="fixed inset-0 bg-black z-[60] flex items-center justify-center overflow-hidden"
    >
      <button
        ref={closeButtonRef}
        onClick={onClose}
        aria-label={tCommon('close')}
        className="absolute right-4 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition z-10"
        style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
      >
        <X className="w-6 h-6 text-white" />
      </button>
      <div
        className="w-full h-full flex items-center justify-center touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={photos[currentIndex]}
          alt={t('photoNumber', { n: currentIndex + 1, total: photos.length })}
          className="max-w-[95vw] max-h-[90vh] object-contain transition-opacity duration-300 select-none"
          draggable={false}
        />
      </div>
      {/* Dots + counter render unconditionally, including for a single photo,
          exactly as before the move. */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
        {photos.map((_: string, idx: number) => (
          <button
            key={idx}
            onClick={() => goTo(idx)}
            aria-label={t('photoNumber', { n: idx + 1, total: photos.length })}
            className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex ? 'bg-white w-6' : 'bg-white/40'}`}
          />
        ))}
      </div>
      <div className="absolute bottom-4 text-white text-sm">
        {currentIndex + 1} / {photos.length}
      </div>
    </div>,
    document.body
  );
}
