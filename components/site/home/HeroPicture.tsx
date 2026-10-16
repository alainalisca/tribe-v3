'use client';

import Image from 'next/image';
import { useSiteT } from '@/lib/site/useSiteT';

/**
 * The Inicio hero photo, the LCP element: preloaded at high priority.
 *
 * ONE CROP, NOT THE MOCK'S TWO. The spec asks for a 4:5 phone crop of the same
 * group photo (w0143), but the group stands across the full width, so any tall
 * crop cuts faces at the edges, which the photo rules forbid. Phones get the
 * whole frame at 3:2 instead (hero.module.css). The mock's embedded "hero_tall"
 * was a different photo and is not used.
 */
export default function HeroPicture() {
  const t = useSiteT('site.alt');
  return <Image src="/site/hero_full.jpg" alt={t('hero_full')} fill sizes="100vw" preload fetchPriority="high" />;
}
