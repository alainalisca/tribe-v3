import { siteCardImage } from '@/lib/og/siteCards';
import { SITE_LANGUAGES } from '@/lib/site/i18n';

/**
 * T-SHARE1 Part B: this page's share card, the JPEG its og:image names
 * (lib/og/siteCards.ts). A route handler, not an opengraph-image file: Next
 * names those without a trailing slash, and trailingSlash: true answers that
 * URL with a 308, so every scraper would chase a redirect for the image.
 * Drawn at build for both languages, then at most once a day.
 */
export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return SITE_LANGUAGES.map((lang) => ({ lang }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const p = await params;
  return siteCardImage('para-atletas', p.lang);
}
