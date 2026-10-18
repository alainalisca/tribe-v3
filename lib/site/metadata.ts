import type { Metadata } from 'next';
import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';
import { siteMessage, type SiteLanguage } from './messages';

/**
 * T-SITE1. Metadata for a site page: title and description from
 * site.meta.<page> in the page's language (with `vars` filled in), canonical on
 * tribelatam.com at the PUBLIC path (never /sitio/...). Both languages live at
 * one URL (the tribe_lang cookie picks), so the es and en alternates both name
 * it.
 *
 * The OG image: a page's share card (T-SHARE1, siteCardPath: a 1200 x 630
 * JPEG) or, for a page still on a plain photo, that photo's path.
 */
export function siteMetadata(
  page: string,
  path: string,
  ogImage: string | null,
  lang: SiteLanguage,
  vars?: Record<string, string>
): Metadata {
  const url = `${CANONICAL_SITE_URL}${path}`;
  const title = siteMessage(lang, `site.meta.${page}`, 'title', vars);
  const description = siteMessage(lang, `site.meta.${page}`, 'description', vars);
  const card = ogImage?.endsWith('/card/') ? { width: 1200, height: 630, type: 'image/jpeg' } : {};
  const image = ogImage ? { url: `${CANONICAL_SITE_URL}${ogImage}`, alt: title, ...card } : null;
  return {
    title,
    description,
    alternates: { canonical: url, languages: { es: url, en: url, 'x-default': url } },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Tribe',
      locale: lang === 'en' ? 'en_US' : 'es_CO',
      ...(image ? { images: [image] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, ...(image ? { images: [image.url] } : {}) },
  };
}
