'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reports once when an element first enters the viewport, and stays true.
 *
 * The carousel uses this to decide when slide 1 is allowed to start
 * downloading: mounting every slide's <img> on first paint would fetch up to
 * six photos per card for a whole feed page.
 *
 * T-VID1 introduces a richer `useInViewPreview` for video. If that lands, this
 * can be folded into it; the observer options are deliberately the same shape.
 */
export function useInView<T extends HTMLElement>(
  rootMargin = '200px'
): {
  ref: React.RefObject<T>;
  inView: boolean;
} {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;

    // Older WebViews (and jsdom) have no IntersectionObserver. Degrade to
    // "visible", which costs an eager load rather than a blank slide.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
