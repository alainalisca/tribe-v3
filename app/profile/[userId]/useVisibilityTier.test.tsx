import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVisibilityTier } from './useVisibilityTier';

/**
 * T-ATH1 step 7.
 *
 * TWO THINGS THESE TESTS EXIST TO CATCH, both measured on production 2026-09-17:
 *
 *  1. TIER 2 RENDERS FOR NOBODY. Zero of 94 athletes share an upcoming session,
 *     because none of the 26 upcoming sessions has a confirmed participant. The
 *     tier-2 path cannot be exercised by live data, so it is exercised here, in
 *     both directions, or not at all.
 *  2. THE ONLY ADMIN IS THE PERSON TESTING. One of 107 users is an admin, and
 *     that account sees every roster row. Every assertion below is written for a
 *     NON-ADMIN viewer -- the representative case -- and the admin-only preview
 *     override is asserted to be refused for everyone else.
 */

const fetchCoAthleteTiers = vi.fn();
const fetchUserIsAdmin = vi.fn();
const searchParams = { value: new URLSearchParams() };

vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams.value }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
const logError = vi.fn();
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a) }));
vi.mock('@/lib/dal', () => ({
  fetchCoAthleteTiers: (...a: unknown[]) => fetchCoAthleteTiers(...a),
  fetchUserIsAdmin: (...a: unknown[]) => fetchUserIsAdmin(...a),
  tierFor: (id: string, t: { upcoming: Set<string>; past: Set<string> }) =>
    t.upcoming.has(id) ? 2 : t.past.has(id) ? 3 : 1,
}));

const VIEWER = 'viewer-1';
const TARGET = 'target-2';

const tiers = (upcoming: string[], past: string[]) => ({
  success: true,
  data: { upcoming: new Set(upcoming), past: new Set(past) },
});

beforeEach(() => {
  vi.clearAllMocks();
  logError.mockClear();
  searchParams.value = new URLSearchParams();
  fetchUserIsAdmin.mockResolvedValue({ success: true, data: false });
});

describe('useVisibilityTier', () => {
  it('is tier 1 for a logged-out viewer, without querying', async () => {
    const { result } = renderHook(() => useVisibilityTier(TARGET, null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe(1);
    expect(result.current.hasTrainedTogether).toBe(false);
    // The roster view is authenticated-only. Querying it logged out would return
    // an empty result that reads exactly like "no shared sessions".
    expect(fetchCoAthleteTiers).not.toHaveBeenCalled();
  });

  it('is tier 2 when the pair shares an upcoming session', async () => {
    fetchCoAthleteTiers.mockResolvedValue(tiers([TARGET], []));
    const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe(2);
  });

  it('is tier 3, and entitled, after a past session together', async () => {
    fetchCoAthleteTiers.mockResolvedValue(tiers([], [TARGET]));
    const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe(3);
    expect(result.current.hasTrainedTogether).toBe(true);
  });

  /**
   * THE PRECEDENCE TRAP. tierFor lets upcoming win, so the MOST connected pair --
   * shared history AND a shared plan -- resolves to tier 2. Gating the sessions
   * list on `tier === 3` would hide it from exactly those people. The gate is the
   * relation, not the label.
   */
  it('keeps the entitlement when a pair shares both, even though the label says 2', async () => {
    fetchCoAthleteTiers.mockResolvedValue(tiers([TARGET], [TARGET]));
    const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe(2);
    expect(result.current.hasTrainedTogether).toBe(true);
  });

  it('is tier 1 for a stranger', async () => {
    fetchCoAthleteTiers.mockResolvedValue(tiers([], []));
    const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe(1);
    expect(result.current.hasTrainedTogether).toBe(false);
  });

  it('marks the viewer looking at their own profile', async () => {
    const { result } = renderHook(() => useVisibilityTier(VIEWER, VIEWER));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isSelf).toBe(true);
    expect(fetchCoAthleteTiers).not.toHaveBeenCalled();
  });

  it('falls back to tier 1 when the query FAILS, and REPORTS the failure', async () => {
    fetchCoAthleteTiers.mockResolvedValue({ success: false, error: 'permission denied' });
    const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tier).toBe(1);
    expect(result.current.previewOf).toBeNull();

    // Asserting the OUTCOME alone is not enough and a mutation run proved it:
    // deleting the `if (!result.success)` branch makes the code read
    // `result.data!.past` on undefined, throw, and land in the outer catch --
    // which also produces tier 1. Identical outcome, completely different
    // behaviour. The distinguishing fact is whether the failure was RECOGNISED,
    // so assert it was logged, with the reason.
    await waitFor(() => expect(logError).toHaveBeenCalled());
    const reported = logError.mock.calls[0][0] as Error;
    expect(reported.message).toContain('permission denied');
  });

  describe('?previewTier override', () => {
    it('is REFUSED for a non-admin, who gets their real tier and no banner', async () => {
      searchParams.value = new URLSearchParams('previewTier=3');
      fetchCoAthleteTiers.mockResolvedValue(tiers([], []));
      fetchUserIsAdmin.mockResolvedValue({ success: true, data: false });

      const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.tier).toBe(1);
      expect(result.current.hasTrainedTogether).toBe(false);
      expect(result.current.previewOf).toBeNull();
    });

    it('applies for an admin, and reports the real tier alongside', async () => {
      searchParams.value = new URLSearchParams('previewTier=2');
      fetchCoAthleteTiers.mockResolvedValue(tiers([], []));
      fetchUserIsAdmin.mockResolvedValue({ success: true, data: true });

      const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.tier).toBe(2);
      // The real tier travels with it so the UI cannot present a forced tier as
      // a computed one.
      expect(result.current.previewOf).toBe(1);
    });

    it('is refused when the admin check itself fails', async () => {
      searchParams.value = new URLSearchParams('previewTier=3');
      fetchCoAthleteTiers.mockResolvedValue(tiers([], []));
      fetchUserIsAdmin.mockResolvedValue({ success: false, error: 'rpc down' });

      const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.tier).toBe(1);
      expect(result.current.previewOf).toBeNull();
    });

    it('ignores a nonsense value rather than treating it as a tier', async () => {
      searchParams.value = new URLSearchParams('previewTier=99');
      fetchCoAthleteTiers.mockResolvedValue(tiers([], [TARGET]));
      fetchUserIsAdmin.mockResolvedValue({ success: true, data: true });

      const { result } = renderHook(() => useVisibilityTier(TARGET, VIEWER));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.tier).toBe(3);
      expect(result.current.previewOf).toBeNull();
      expect(fetchUserIsAdmin).not.toHaveBeenCalled();
    });
  });
});
