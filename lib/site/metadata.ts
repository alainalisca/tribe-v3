import type { Metadata } from 'next';
import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';
import { siteMessage, type SiteLanguage } from './messages';

/**
 * T-SITE1. Metadata for a site page: title and description from
 * site.meta.<page> in the page's language, canonical on tribelatam.com at the
 * PUBLIC path (never /sitio/...), the page's hero crop as the OG image. Both
 * languages live at one URL (the tribe_lang cookie picks), so the es and en
 * alternates both name it.
 */
export function siteMetadata(page: string, path: string, ogImage: string, lang: SiteLanguage): Metadata {
  const url = `${CANONICAL_SITE_URL}${path}`;
  const title = siteMessage(lang, `site.meta.${page}`, 'title');
  const description = siteMessage(lang, `site.meta.${page}`, 'description');
  const image = { url: `${CANONICAL_SITE_URL}${ogImage}`, alt: title };
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
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}
