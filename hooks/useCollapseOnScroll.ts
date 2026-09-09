'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Collapse a pinned region when the page scrolls down, restore it on any
 * scroll up.
 *
 * The home feed's fixed header measures 319px on a 375x667 phone with
 * location granted — 48% of the viewport — so athletes scroll the feed
 * through a letterbox. Collapsing the filter controls buys most of that back
 * without removing a single filter.
 *
 * Passive listener, rAF-throttled. No library.
 */
export function useCollapseOnScroll(triggerPx = 80): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);
  // A separate flag rather than testing the rAF handle: a handle of 0 is
  // ambiguous against `!== null` and would drop every scroll after the first.
  const pending = useRef(false);

  useEffect(() => {
    lastY.current = window.scrollY;

    function read() {
      const y = window.scrollY;
      const previous = lastY.current;
      lastY.current = y;

      // Any upward movement restores the controls immediately: an athlete
      // scrolling back up is looking for them.
      if (y < previous) {
        setCollapsed(false);
        return;
      }
      if (y > previous && y > triggerPx) setCollapsed(true);
    }

    function onScroll() {
      if (pending.current) return;
      pending.current = true;
      requestAnimationFrame(() => {
        pending.current = false;
        read();
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [triggerPx]);

  return collapsed;
}
