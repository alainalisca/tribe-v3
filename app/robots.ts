import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/http/siteUrl';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] },
    // See sitemap.ts: tribe.fitness is not ours.
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
