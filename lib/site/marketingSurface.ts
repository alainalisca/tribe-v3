'use client';

/**
 * T-SITE1 Part F. "Is the marketing site on screen?", for the app-wide chrome in
 * the root layout that must stay off it: the install banner and the feedback
 * widget.
 *
 * WHY NOT A PATH LIST. Signed-out `/` is the site, signed-in `/` is the feed, and
 * they share the URL: middleware rewrites the first to /inicio, so usePathname()
 * reports "/" for both. Only the rendered tree knows which one is showing. The
 * site layout mounts <MarketingSurfaceMarker/>, which counts itself in here, and
 * the chrome subscribes. The count is 0 on the server and during hydration, so
 * nothing renders differently between the two.
 */
import { useEffect, useSyncExternalStore } from 'react';

let mounted = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsMarketingSurface(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mounted > 0,
    () => false
  );
}

export function useMarkMarketingSurface(): void {
  useEffect(() => {
    mounted += 1;
    emit();
    return () => {
      mounted -= 1;
      emit();
    };
  }, []);
}
