import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/http/siteUrl';

export default function sitemap(): MetadataRoute.Sitemap {
  // tribe.fitness is NOT a domain Tribe owns; a sitemap announcing someone
  // else's host is worse than no sitemap at all.
  const baseUrl = SITE_URL;
  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/for-instructors`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];
}
