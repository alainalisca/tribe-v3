import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/http/siteUrl';
import { getAnonClient } from '@/lib/supabase/anon';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { fetchSitemapInstructorIds, fetchSitemapPartnerSlugs, fetchSitemapSessions } from '@/lib/dal/sitemap';
import { bogotaToday, buildSitemapEntries } from '@/lib/seo/sitemapEntries';
import type { DalResult } from '@/lib/dal/types';
import { logError } from '@/lib/logger';

/**
 * T-GROW5a: the sitemap, from the database. Regenerated at most hourly, so a
 * crawler hitting it costs one set of queries per hour, not one per fetch.
 *
 * A SECTION THAT FAILS IS OMITTED, NEVER FATAL. The DAL logs the failure; this
 * file lists the rest. A sitemap that 500s because one view hiccupped would
 * take the static pages down with it. SITE_URL is tribelatam.com
 * (lib/http/siteUrl.ts); tribe.fitness, which Tribe does not own, is gone.
 */
export const revalidate = 3600;

/** A failed DAL call was logged by the DAL; a rejection (a throw) is logged here. */
function listOrEmpty<T>(result: PromiseSettledResult<DalResult<T[]>>, section: string): T[] {
  if (result.status === 'rejected') {
    logError(result.reason, { action: 'sitemap', section });
    return [];
  }
  if (!result.value.success) return [];
  return result.value.data ?? [];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  // Each section starts inside its own .then(), so a client constructor that
  // throws (a missing env var) rejects that section instead of the whole file.
  const start = Promise.resolve();
  const [partners, instructors, sessions] = await Promise.allSettled([
    start.then(() => fetchSitemapPartnerSlugs(getAnonClient())),
    start.then(() => fetchSitemapInstructorIds(getServiceRoleClient())),
    start.then(() => fetchSitemapSessions(getAnonClient(), bogotaToday(now))),
  ]);

  return buildSitemapEntries({
    siteUrl: SITE_URL,
    partnerSlugs: listOrEmpty(partners, 'partners'),
    instructorIds: listOrEmpty(instructors, 'instructors'),
    sessions: listOrEmpty(sessions, 'sessions'),
    now,
  });
}
