import type { Metadata } from 'next';
import { CANONICAL_SITE_URL } from '@/lib/http/siteUrl';
import { siteMessage } from './messages';

/**
 * T-SITE1. Metadata for a site page: Spanish title and description from
 * site.meta.<page>, canonical on tribelatam.com, the page's hero crop as the OG
 * image. Language is chosen client side on one URL, so es and en alternates
 * both name it.
 */
export function siteMetadata(page: string, path: string, ogImage: string): Metadata {
  const url = `${CANONICAL_SITE_URL}${path}`;
  const title = siteMessage('es', `site.meta.${page}`, 'title');
  const description = siteMessage('es', `site.meta.${page}`, 'description');
  const image = { url: `${CANONICAL_SITE_URL}${ogImage}`, alt: title };
  return {
    title,
    description,
    alternates: { canonical: url, languages: { es: url, en: url, 'x-default': url } },
    openGraph: { title, description, url, type: 'website', siteName: 'Tribe', locale: 'es_CO', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}
