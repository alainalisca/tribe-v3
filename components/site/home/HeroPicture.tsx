import Image from 'next/image';

/**
 * The Inicio hero photo, the LCP element: preloaded at high priority.
 *
 * ONE CROP, NOT THE MOCK'S TWO. The group in w0143 stands across the full
 * width, so any tall phone crop cuts faces at the edges, which the photo rules
 * forbid. Phones get the whole frame at 3:2 (hero.module.css); Al dropped
 * hero_tall from the spec on 2026-10-16.
 */
export default function HeroPicture({ alt }: { alt: string }) {
  return <Image src="/site/hero_full.jpg" alt={alt} fill sizes="100vw" preload fetchPriority="high" />;
}
