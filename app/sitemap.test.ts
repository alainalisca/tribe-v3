import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * app/sitemap.ts: a failing section is omitted and logged, never fatal. The
 * static pages must survive any one database read failing, including a client
 * constructor that throws before its query starts.
 */
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/anon', () => ({ getAnonClient: vi.fn(() => ({})) }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn(() => ({})) }));
vi.mock('@/lib/dal/sitemap', () => ({
  fetchSitemapPartnerSlugs: vi.fn(),
  fetchSitemapInstructorIds: vi.fn(),
  fetchSitemapSessions: vi.fn(),
}));

import sitemap, { revalidate } from './sitemap';
import { fetchSitemapInstructorIds, fetchSitemapPartnerSlugs, fetchSitemapSessions } from '@/lib/dal/sitemap';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logger';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchSitemapPartnerSlugs).mockResolvedValue({ success: true, data: ['bullbox'] });
  vi.mocked(fetchSitemapInstructorIds).mockResolvedValue({ success: true, data: ['i1'] });
  vi.mocked(fetchSitemapSessions).mockResolvedValue({ success: true, data: [{ id: 's1', date: '2026-10-12' }] });
});

describe('sitemap', () => {
  it('lists every section', async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/g/bullbox/'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/i/i1/'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/s/s1/'))).toBe(true);
  });

  it('omits a section whose DAL failed and keeps the rest', async () => {
    vi.mocked(fetchSitemapSessions).mockResolvedValue({ success: false, error: 'boom' });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes('/s/'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/g/bullbox/'))).toBe(true);
  });

  it('survives a client constructor that THROWS, and logs which section it lost', async () => {
    vi.mocked(getServiceRoleClient).mockImplementation(() => {
      throw new Error('missing SUPABASE_SERVICE_ROLE_KEY');
    });
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.includes('/i/'))).toBe(false);
    expect(urls.some((u) => u.endsWith('/g/bullbox/'))).toBe(true);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ section: 'instructors' }));
  });

  it('regenerates hourly rather than on every crawl', () => {
    expect(revalidate).toBe(3600);
  });
});
