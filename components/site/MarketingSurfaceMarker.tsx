'use client';

import { useMarkMarketingSurface } from '@/lib/site/marketingSurface';

/** Tells the root layout's app chrome that the marketing site is showing. Renders nothing. */
export default function MarketingSurfaceMarker() {
  useMarkMarketingSurface();
  return null;
}
