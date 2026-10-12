/**
 * DAL: what the sitemap lists (T-GROW5a). Each function answers one section and
 * applies the SAME gates the page it points at applies, so the sitemap never
 * announces a URL a visitor would find empty, private or redirected.
 *
 * Measured on production 2026-10-09 (SELECT only) before writing this:
 *   - partners_public excludes status 'pending' and business_type 'independent',
 *     but NOT 'paused', and it has no status column. featured_partners' anon RLS
 *     admits only status = 'active'. A partner is listed when it is in both.
 *   - sessions_public excludes join_policy 'invite_only' and still carries
 *     cancelled sessions, so status = 'active' is filtered here.
 *   - users_discoverable is NOT readable by anon (the /instructors page is
 *     signed-in only), so the instructor section cannot use the anon client.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import { fetchInstructors } from './instructors';

/** Public partner pages: in partners_public AND active. Pass the ANON client. */
export async function fetchSitemapPartnerSlugs(anon: SupabaseClient): Promise<DalResult<string[]>> {
  try {
    const [pub, active] = await Promise.all([
      anon.from('partners_public').select('slug'),
      // RLS returns only status = 'active' rows to anon; the eq() says so out loud
      // and keeps this correct if that policy is ever widened.
      anon.from('featured_partners').select('slug').eq('status', 'active'),
    ]);
    if (pub.error || active.error) {
      const error = pub.error ?? active.error;
      logError(error, { action: 'fetchSitemapPartnerSlugs' });
      return { success: false, error: error?.message ?? 'partner read failed' };
    }
    const activeSlugs = new Set((active.data ?? []).map((r: { slug: string | null }) => r.slug));
    const slugs = (pub.data ?? [])
      .map((r: { slug: string | null }) => r.slug)
      .filter((s): s is string => typeof s === 'string' && s.length > 0 && activeSlugs.has(s));
    return { success: true, data: [...new Set(slugs)].sort() };
  } catch (error) {
    logError(error, { action: 'fetchSitemapPartnerSlugs' });
    return { success: false, error: 'partner read failed' };
  }
}

export interface SitemapSession {
  id: string;
  date: string;
}

/** Upcoming public sessions, from sessions_public. Pass the ANON client. */
export async function fetchSitemapSessions(
  anon: SupabaseClient,
  todayBogota: string,
  limit = 5000
): Promise<DalResult<SitemapSession[]>> {
  try {
    const { data, error } = await anon
      .from('sessions_public')
      .select('id, date')
      .eq('status', 'active')
      .gte('date', todayBogota)
      .order('date', { ascending: true })
      .limit(limit);
    if (error) {
      logError(error, { action: 'fetchSitemapSessions' });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data ?? []) as SitemapSession[] };
  } catch (error) {
    logError(error, { action: 'fetchSitemapSessions' });
    return { success: false, error: 'session read failed' };
  }
}

/**
 * Instructor ids, through the /instructors page's own DAL so every gate it
 * applies (test and deleted accounts via users_discoverable, organization
 * accounts, the T-PROF1 completeness check) applies here too.
 *
 * SERVICE ROLE, and only ids leave this function. anon cannot read
 * users_discoverable, and every id returned is an /i/{id}/ page that already
 * renders for a signed-out stranger, so the service role adds reach, not data.
 */
export async function fetchSitemapInstructorIds(admin: SupabaseClient): Promise<DalResult<string[]>> {
  const result = await fetchInstructors(admin);
  if (!result.success || !result.data) {
    logError(new Error(result.error ?? 'instructor read failed'), { action: 'fetchSitemapInstructorIds' });
    return { success: false, error: result.error ?? 'instructor read failed' };
  }
  return { success: true, data: result.data.map((i) => i.id).sort() };
}
