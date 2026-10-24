import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * T-PLAN1: with COACH_PLANS_ENABLED off, the queries T-PLAN1 touched must read
 * exactly what they read before (Al, 2026-10-12: "With the flag off, production
 * must look and behave exactly as it does today"). With it on, they add the
 * plan columns. Captured at the .select() call.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/storage/privateMedia', () => ({ signRecapPhotoUrls: vi.fn() }));
// The signed-out session page's server read (T-SSR1) goes through the service role.
const serviceClient = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => serviceClient.current }));

import { fetchUpcomingSessions, fetchSessionPublicView } from './sessions';
import { fetchUserProfile } from './users';
import { loadSessionForCard } from '@/lib/og/sessionCard';

function capture() {
  const selects: string[] = [];
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: (cols: string) => {
      selects.push(cols.replace(/\s+/g, ' ').trim());
      return chain;
    },
    eq: self,
    gte: self,
    order: self,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  });
  return { client: { from: () => chain } as never, selects };
}

afterEach(() => vi.unstubAllEnvs());

describe.each([
  ['off', 'false', false],
  ['on', 'true', true],
])('COACH_PLANS_ENABLED %s', (_label, flag, expectPlan) => {
  it('home feed creator embed', async () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', flag);
    const { client, selects } = capture();
    await fetchUpcomingSessions(client);
    expect(selects[0].includes('coach_plan')).toBe(expectPlan);
    expect(selects[0]).toContain(
      'creator:users!sessions_creator_id_fkey!inner(id, name, avatar_url, average_rating, total_reviews, total_sessions_hosted, cover_image_url'
    );
  });

  it('signed-out session detail (sessions_public)', async () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', flag);
    const { client, selects } = capture();
    await fetchSessionPublicView(client, 's1');
    expect(selects[0].includes('creator_coach_plan')).toBe(expectPlan);
    expect(selects[0].endsWith(expectPlan ? 'is_test, creator_coach_plan' : 'is_test')).toBe(true);
  });

  it('signed-out session page, server read (T-SSR1, sessions_public)', async () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', flag);
    const { client, selects } = capture();
    serviceClient.current = client;
    await loadSessionForCard('s1');
    expect(selects[0].includes('creator_coach_plan')).toBe(expectPlan);
    expect(selects[0].endsWith(expectPlan ? 'creator_avatar_url, creator_coach_plan' : 'creator_avatar_url')).toBe(
      true
    );
  });

  it('profile: plan and the Tribe+ / Trailblazer badge columns', async () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', flag);
    const { client, selects } = capture();
    await fetchUserProfile(client, 'u1');
    for (const col of ['coach_plan', 'subscription_tier', 'subscription_expires_at', 'is_trailblazer']) {
      expect(selects[0].includes(col)).toBe(expectPlan);
    }
    expect(selects[0].endsWith(expectPlan ? 'is_trailblazer, coach_plan' : 'created_at, updated_at')).toBe(true);
  });
});
