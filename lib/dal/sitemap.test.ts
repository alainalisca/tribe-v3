import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The gates each sitemap section applies. The view names and filters are the
 * point: a sitemap that read `sessions` instead of `sessions_public`, or forgot
 * status = 'active', would announce private or cancelled sessions to Google.
 */
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('./instructors', () => ({ fetchInstructors: vi.fn() }));

import { fetchSitemapInstructorIds, fetchSitemapPartnerSlugs, fetchSitemapSessions } from './sitemap';
import { fetchInstructors, type InstructorProfile } from './instructors';
import { logError } from '@/lib/logger';

interface Call {
  table: string;
  ops: Array<[string, unknown[]]>;
}

/** A chainable fake that records every call and resolves with a per-table result. */
function fakeClient(results: Record<string, { data: unknown; error: unknown }>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const chain = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(results[table]).then(resolve),
      } as Record<string, unknown>;
      for (const op of ['select', 'eq', 'gte', 'order', 'limit']) {
        chain[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return chain;
        };
      }
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

beforeEach(() => vi.clearAllMocks());

describe('fetchSitemapPartnerSlugs', () => {
  it('lists a partner only when it is in partners_public AND active', async () => {
    const { client, calls } = fakeClient({
      partners_public: { data: [{ slug: 'bullbox' }, { slug: 'paused-gym' }], error: null },
      featured_partners: { data: [{ slug: 'bullbox' }, { slug: 'solo-trainer' }], error: null },
    });
    expect(await fetchSitemapPartnerSlugs(client)).toEqual({ success: true, data: ['bullbox'] });
    const fp = calls.find((c) => c.table === 'featured_partners');
    expect(fp?.ops).toContainEqual(['eq', ['status', 'active']]);
  });

  it('recognises a failed read and logs it', async () => {
    const { client } = fakeClient({
      partners_public: { data: null, error: { message: 'boom' } },
      featured_partners: { data: [], error: null },
    });
    expect((await fetchSitemapPartnerSlugs(client)).success).toBe(false);
    expect(logError).toHaveBeenCalled();
  });
});

describe('fetchSitemapSessions', () => {
  it('reads sessions_public, active only, from today in Medellín', async () => {
    const { client, calls } = fakeClient({ sessions_public: { data: [{ id: 's1', date: '2026-10-12' }], error: null } });
    expect(await fetchSitemapSessions(client, '2026-10-09')).toEqual({
      success: true,
      data: [{ id: 's1', date: '2026-10-12' }],
    });
    expect(calls.map((c) => c.table)).toEqual(['sessions_public']);
    expect(calls[0].ops).toContainEqual(['eq', ['status', 'active']]);
    expect(calls[0].ops).toContainEqual(['gte', ['date', '2026-10-09']]);
  });
});

describe('fetchSitemapInstructorIds', () => {
  it('takes ids from the /instructors DAL, so its gates apply, and nothing else', async () => {
    const profile: InstructorProfile = {
      id: 'i1',
      name: 'Ana',
      avatar_url: null,
      tagline: null,
      location: null,
      sports: [],
      specialties: [],
      verified: false,
      average_rating: 0,
      total_reviews: 0,
      total_sessions: 0,
      is_instructor: true,
      created_at: '2026-01-01',
      location_lat: null,
      location_lng: null,
      years_experience: 1,
    };
    vi.mocked(fetchInstructors).mockResolvedValue({ success: true, data: [profile] });
    const { client } = fakeClient({});
    expect(await fetchSitemapInstructorIds(client)).toEqual({ success: true, data: ['i1'] });
    expect(fetchInstructors).toHaveBeenCalledWith(client);
  });

  it('recognises an instructor read failure and logs it', async () => {
    vi.mocked(fetchInstructors).mockResolvedValue({ success: false, error: '42501' });
    expect((await fetchSitemapInstructorIds(fakeClient({}).client)).success).toBe(false);
    expect(logError).toHaveBeenCalled();
  });
});
