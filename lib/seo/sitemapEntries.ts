/**
 * The sitemap's entries, from already-fetched lists. Pure, so every rule is a
 * unit test rather than a reading of app/sitemap.ts.
 *
 * TRAILING SLASHES on every URL: next.config sets trailingSlash: true, so a
 * slash-less URL answers 308 and a crawler is told to index a redirect.
 *
 * /pase/{slug}/ IS DELIBERATELY ABSENT. Every pass page sets
 * robots: { index: false } (app/pase/[slug]/page.tsx: a lead-capture form under
 * a partner's brand should not sit in search results Tribe does not control the
 * wording of). Listing a noindex URL in a sitemap is a contradiction Search
 * Console reports as an error. The T-GROW5a spec asked for active pass pages;
 * that conflicts with a decision already in the code, and reversing it is Al's
 * call, not this file's. sitemapEntries.test.ts pins the absence.
 */
import type { MetadataRoute } from 'next';

export interface SitemapInput {
  siteUrl: string;
  partnerSlugs: string[];
  instructorIds: string[];
  sessions: { id: string; date: string }[];
  now: Date;
}

/** The static pages that were already listed, now with their trailing slashes. */
export const STATIC_PAGES: { path: string; changeFrequency: 'weekly' | 'monthly'; priority: number }[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/for-instructors/', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/about/', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/faq/', changeFrequency: 'monthly', priority: 0.6 },
];

/**
 * Today's date in Medellín as YYYY-MM-DD. Colombia has no daylight saving, so
 * a fixed -05:00 is exact, and avoids depending on ICU time zone data at runtime.
 */
export function bogotaToday(now: Date): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

export function buildSitemapEntries(input: SitemapInput): MetadataRoute.Sitemap {
  const base = input.siteUrl.replace(/\/+$/, '');
  const now = input.now;
  return [
    ...STATIC_PAGES.map((p) => ({
      url: `${base}${p.path}`,
      lastModified: now,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...input.partnerSlugs.map((slug) => ({
      url: `${base}/g/${encodeURIComponent(slug)}/`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...input.instructorIds.map((id) => ({
      url: `${base}/i/${encodeURIComponent(id)}/`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...input.sessions.map((s) => ({
      url: `${base}/s/${encodeURIComponent(s.id)}/`,
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
  ];
}
