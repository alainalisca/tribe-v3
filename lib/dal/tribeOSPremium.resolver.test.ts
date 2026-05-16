/**
 * Tests for getTribeOSPremiumStatusForUser — the gym-aware resolver
 * that requireTribeOSPremium() calls on every premium-gated route.
 *
 * Three-tier resolution order:
 *   1. Any OWNED gym with active/trialing → premium (preferred path)
 *   2. Any COACHED gym with active/trialing → premium
 *   3. Legacy users.tribe_os_* row → premium iff active
 *   4. Nothing matches → not premium
 *
 * These tests pin the lookup order + edge cases:
 *   - Soft-deleted gyms (deleted_at != null) MUST NOT count
 *   - Past-due / canceled gym subscriptions MUST NOT count (gate
 *     closes on failed invoice)
 *   - Owned-gym active wins over coached-gym past_due (priority)
 *   - Coached-only path still grants access (worker at another gym)
 *   - Legacy fallback fires only when neither gym branch matched
 *
 * Heavy mock: the function makes up to three sequential queries
 * (gyms-owned, gym_coaches-with-join, users-legacy). The mock
 * routes by table name and returns whatever the test set up for
 * each branch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { getTribeOSPremiumStatusForUser } from './tribeOSPremium';

type GymRow = {
  id: string;
  tribe_os_tier: 'solo' | 'team_studio' | null;
  tribe_os_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null;
  deleted_at?: string | null;
};

type LegacyRow = {
  tribe_os_tier: 'solo' | 'team_studio' | null;
  tribe_os_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null;
};

function mockSupabase(opts: {
  ownedGyms?: GymRow[];
  ownedError?: { message: string } | null;
  coachedGyms?: GymRow[]; // wrapped into { gym: ... } join shape by the mock
  coachedError?: { message: string } | null;
  legacyRow?: LegacyRow | null;
  legacyError?: { message: string } | null;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'gyms') {
        // .select('id, tribe_os_tier, tribe_os_status').eq('owner_user_id', userId).is('deleted_at', null)
        // returns a Promise — the final `await` resolves directly.
        const result = Promise.resolve({
          data: opts.ownedGyms ?? [],
          error: opts.ownedError ?? null,
        });
        return {
          select: () => ({
            eq: () => ({
              is: () => result,
            }),
          }),
        };
      }
      if (table === 'gym_coaches') {
        // The DAL maps over rows of shape { gym: GymRow | null }.
        const joined = (opts.coachedGyms ?? []).map((g) => ({ gym: g }));
        const result = Promise.resolve({
          data: joined,
          error: opts.coachedError ?? null,
        });
        return {
          select: () => ({ eq: () => result }),
        };
      }
      if (table === 'users') {
        const maybeSingle = vi.fn().mockResolvedValue({
          data: opts.legacyRow ?? null,
          error: opts.legacyError ?? null,
        });
        return {
          select: () => ({
            eq: () => ({ maybeSingle }),
          }),
        };
      }
      return {};
    }),
  };
}

describe('getTribeOSPremiumStatusForUser', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Owned-gym branch ────────────────────────────────────────────

  it('grants access when the user owns an active gym (primary path)', async () => {
    const supabase = mockSupabase({
      ownedGyms: [{ id: 'gym-1', tribe_os_tier: 'solo', tribe_os_status: 'active' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      active: true,
      tier: 'solo',
      status: 'active',
      gymId: 'gym-1',
    });
  });

  it('grants access for owned trialing gym (mid-trial users keep access)', async () => {
    const supabase = mockSupabase({
      ownedGyms: [{ id: 'gym-trial', tribe_os_tier: 'solo', tribe_os_status: 'trialing' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.active).toBe(true);
    expect(res.data?.status).toBe('trialing');
  });

  it('does NOT grant access when owned gym is past_due', async () => {
    const supabase = mockSupabase({
      ownedGyms: [{ id: 'gym-pd', tribe_os_tier: 'solo', tribe_os_status: 'past_due' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.active).toBe(false);
  });

  it('does NOT grant access when owned gym is canceled', async () => {
    const supabase = mockSupabase({
      ownedGyms: [{ id: 'gym-c', tribe_os_tier: 'solo', tribe_os_status: 'canceled' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.active).toBe(false);
  });

  // ── Coached-gym branch ──────────────────────────────────────────

  it('grants access when the user coaches an active gym (no owned gyms)', async () => {
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedGyms: [{ id: 'gym-coached', tribe_os_tier: 'team_studio', tribe_os_status: 'active' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-coach');
    expect(res.data).toEqual({
      active: true,
      tier: 'team_studio',
      status: 'active',
      gymId: 'gym-coached',
    });
  });

  it('does NOT grant access when coached gym is soft-deleted', async () => {
    // Soft-deleted gym must not gate active — the gym effectively
    // doesn't exist for the coach anymore.
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedGyms: [
        {
          id: 'gym-deleted',
          tribe_os_tier: 'solo',
          tribe_os_status: 'active',
          deleted_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.active).toBe(false);
  });

  it('does NOT grant access when coached gym is past_due', async () => {
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedGyms: [{ id: 'gym-pd', tribe_os_tier: 'solo', tribe_os_status: 'past_due' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.active).toBe(false);
  });

  // ── Owned vs coached priority ───────────────────────────────────

  it('returns the OWNED gym when the user owns one AND coaches another (priority)', async () => {
    // Both active. Owned wins (it's checked first; the early-return
    // means coached doesn't even get evaluated). Pin this so a future
    // refactor doesn't accidentally invert the order — coaches at
    // another gym might pay for their OWN tier separately.
    const supabase = mockSupabase({
      ownedGyms: [{ id: 'owned', tribe_os_tier: 'solo', tribe_os_status: 'active' }],
      coachedGyms: [{ id: 'coached', tribe_os_tier: 'team_studio', tribe_os_status: 'active' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.gymId).toBe('owned');
    expect(res.data?.tier).toBe('solo');
  });

  it('falls through to coached when owned exists but is canceled', async () => {
    const supabase = mockSupabase({
      ownedGyms: [{ id: 'owned', tribe_os_tier: 'solo', tribe_os_status: 'canceled' }],
      coachedGyms: [{ id: 'coached', tribe_os_tier: 'team_studio', tribe_os_status: 'active' }],
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.gymId).toBe('coached');
  });

  // ── Legacy fallback ─────────────────────────────────────────────

  it('uses legacy users.tribe_os_* when no gym branch matched', async () => {
    // CLI-granted design partner who hasn't been migrated to a
    // gym record. Legacy row has tier set, status null = manually
    // granted → active.
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedGyms: [],
      legacyRow: { tribe_os_tier: 'solo', tribe_os_status: null },
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'design-partner');
    expect(res.data).toEqual({
      active: true,
      tier: 'solo',
      status: null,
      gymId: null,
    });
  });

  it('legacy past_due closes the gate even with tier set', async () => {
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedGyms: [],
      legacyRow: { tribe_os_tier: 'solo', tribe_os_status: 'past_due' },
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.data?.active).toBe(false);
  });

  it('returns inactive when no row at any layer matches', async () => {
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedGyms: [],
      legacyRow: null,
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'non-premium-user');
    expect(res.data).toEqual({
      active: false,
      tier: null,
      status: null,
      gymId: null,
    });
  });

  // ── Error paths ─────────────────────────────────────────────────

  it('returns failure when the owned-gym query errors', async () => {
    const supabase = mockSupabase({
      ownedError: { message: 'db blew up on gyms query' },
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.success).toBe(false);
  });

  it('returns failure when the coached-gym query errors', async () => {
    // Note: this only fires if the owned-gym branch returned no matches
    // (otherwise we already early-returned with active=true).
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedError: { message: 'db blew up on gym_coaches query' },
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.success).toBe(false);
  });

  it('returns failure when the legacy users query errors', async () => {
    const supabase = mockSupabase({
      ownedGyms: [],
      coachedGyms: [],
      legacyError: { message: 'db blew up on users query' },
    });
    const res = await getTribeOSPremiumStatusForUser(supabase as never, 'user-1');
    expect(res.success).toBe(false);
  });
});
