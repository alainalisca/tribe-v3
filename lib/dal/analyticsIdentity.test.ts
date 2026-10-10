/**
 * T-ANALYTICS1 part B: the identity facts read for PostHog.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
const fetchUserIsAdmin = vi.fn();
vi.mock('./users', () => ({ fetchUserIsAdmin: (...a: unknown[]) => fetchUserIsAdmin(...a) }));

import { fetchAnalyticsIdentityFacts } from './analyticsIdentity';

type Res = { data: unknown; error: { message: string } | null };

function fakeSupabase(users: Res, partners: Res) {
  const selects: Record<string, string> = {};
  const client = {
    from(table: string) {
      return {
        select(cols: string) {
          selects[table] = cols;
          const chain = {
            eq: () => chain,
            maybeSingle: async () => users,
            limit: async () => partners,
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, selects };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchUserIsAdmin.mockResolvedValue({ success: true, data: false });
});

describe('fetchAnalyticsIdentityFacts', () => {
  it('reads only the role inputs and language, never a PII column', async () => {
    const { client, selects } = fakeSupabase(
      { data: { is_instructor: true, preferred_language: 'es' }, error: null },
      { data: [], error: null }
    );
    const r = await fetchAnalyticsIdentityFacts(client, 'u1');
    expect(r).toEqual({
      success: true,
      data: { isAdmin: false, ownsPartner: false, isInstructor: true, preferredLanguage: 'es' },
    });
    expect(selects.users).toBe('is_instructor, preferred_language');
    expect(selects.featured_partners).toBe('id');
  });

  it('owning a featured_partners row is what makes a gym', async () => {
    const { client } = fakeSupabase(
      { data: { is_instructor: true, preferred_language: 'en' }, error: null },
      { data: [{ id: 'p1' }], error: null }
    );
    expect((await fetchAnalyticsIdentityFacts(client, 'u1')).data?.ownsPartner).toBe(true);
  });

  it('admin comes from the RPC wrapper, and a failed check is soft: not admin', async () => {
    fetchUserIsAdmin.mockResolvedValue({ success: true, data: true });
    const ok = fakeSupabase(
      { data: { is_instructor: false, preferred_language: null }, error: null },
      { data: [], error: null }
    );
    expect((await fetchAnalyticsIdentityFacts(ok.client, 'u1')).data?.isAdmin).toBe(true);

    fetchUserIsAdmin.mockResolvedValue({ success: false, error: 'rpc down' });
    expect((await fetchAnalyticsIdentityFacts(ok.client, 'u1')).data?.isAdmin).toBe(false);
  });

  it('a failed partner read is soft: not a gym', async () => {
    const { client } = fakeSupabase(
      { data: { is_instructor: true, preferred_language: 'en' }, error: null },
      { data: null, error: { message: 'denied' } }
    );
    const r = await fetchAnalyticsIdentityFacts(client, 'u1');
    expect(r.success).toBe(true);
    expect(r.data?.ownsPartner).toBe(false);
  });

  it('a failed users read is a failure: there is no role without it', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'denied' } }, { data: [], error: null });
    expect(await fetchAnalyticsIdentityFacts(client, 'u1')).toEqual({ success: false, error: 'denied' });
  });
});
