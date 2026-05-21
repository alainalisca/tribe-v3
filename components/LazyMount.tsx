'use client';

/**
 * LazyMount — render children only when the placeholder scrolls into view.
 *
 * Used to defer heavy discovery components on the home feed
 * (FeaturedInstructors, FeaturedPartnerBanner, LocalFitnessEventsSection,
 * StoriesCarousel, etc.) so they don't all fire their own Supabase fetches
 * on first paint. Each one self-fetches in a useEffect, so simply not
 * mounting them keeps the network quiet until the user actually scrolls
 * past where they'd appear.
 *
 * Once mounted, the children stay mounted — we don't unmount when they
 * scroll back out of view, because re-mounting would re-trigger fetches
 * and feel janky.
 *
 * Defaults:
 *   - rootMargin '300px 0px' so we start mounting just before the user
 *     scrolls to them (avoids a visible empty gap).
 *   - minHeight '120px' for the placeholder so layout doesn't jump.
 */

import { useEffect, useRef, useState } from 'react';

interface LazyMountProps {
  children: React.ReactNode;
  /** Minimum height for the placeholder before mount. Default 120px. */
  minHeight?: string;
  /** IntersectionObserver rootMargin. Default '300px 0px' (pre-mount). */
  rootMargin?: string;
}

export default function LazyMount({ children, minHeight = '120px', rootMargin = '300px 0px' }: LazyMountProps) {
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mounted) return;
    if (typeof IntersectionObserver === 'undefined') {
      // SSR / very old browser fallback — just mount immediately.
      setMounted(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted, rootMargin]);

  if (mounted) return <>{children}</>;

  return <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
}
