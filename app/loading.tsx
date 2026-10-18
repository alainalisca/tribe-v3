/**
 * Root route-level loading UI.
 *
 * Previously returned `null`, so every route without its own
 * loading.tsx flashed blank white during navigation/Suspense. A
 * neutral, theme-aware skeleton reads as "loading" instead of "broken"
 * and crossfades into real content rather than popping in.
 *
 * T-SSR1: chosen by path (components/RouteLoadingFallback.tsx). The public
 * session and coach pages and the marketing site get a plain paper blank;
 * every app route keeps this skeleton exactly.
 */
import RouteLoadingFallback from '@/components/RouteLoadingFallback';

export default function Loading() {
  return <RouteLoadingFallback />;
}
