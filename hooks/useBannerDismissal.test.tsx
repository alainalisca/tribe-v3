import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockGetUser = vi.fn();
const mockFetchState = vi.fn();
const mockDismiss = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/dal', () => ({
  fetchOnboardingState: (...a: unknown[]) => mockFetchState(...a),
  dismissBanner: (...a: unknown[]) => mockDismiss(...a),
}));

import { useBannerDismissal, BANNER_IDS } from './useBannerDismissal';

beforeEach(() => {
  window.localStorage.clear();
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } });
  mockFetchState
    .mockReset()
    .mockResolvedValue({ success: true, data: { onboardingCompletedAt: null, dismissedBanners: [] } });
  mockDismiss.mockReset().mockResolvedValue({ success: true });
});

afterEach(() => vi.clearAllMocks());

describe('useBannerDismissal', () => {
  it('reports loading until the answer is known', () => {
    mockFetchState.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useBannerDismissal(BANNER_IDS.streak));
    expect(result.current.loading).toBe(true);
  });

  it('shows a banner the athlete has not dismissed', async () => {
    const { result } = renderHook(() => useBannerDismissal(BANNER_IDS.streak));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dismissed).toBe(false);
  });

  it('hides one they already dismissed, on any device', async () => {
    mockFetchState.mockResolvedValue({
      success: true,
      data: { onboardingCompletedAt: null, dismissedBanners: ['streak'] },
    });
    const { result } = renderHook(() => useBannerDismissal(BANNER_IDS.streak));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dismissed).toBe(true);
  });

  it('hides rather than shows when the state cannot be read', async () => {
    mockFetchState.mockResolvedValue({ success: false, error: 'boom' });
    const { result } = renderHook(() => useBannerDismissal(BANNER_IDS.referral));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // A missing banner beats one that returns after being dismissed.
    expect(result.current.dismissed).toBe(true);
  });

  it('dismisses through the atomic RPC, and mirrors locally', async () => {
    const { result } = renderHook(() => useBannerDismissal(BANNER_IDS.referral));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.dismiss());

    expect(result.current.dismissed).toBe(true);
    expect(window.localStorage.getItem('tribe_banner_dismissed_referral')).toBe('1');
    await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith(expect.anything(), 'referral'));
  });

  it('stays dismissed after a failed server write', async () => {
    mockDismiss.mockResolvedValue({ success: false, error: 'offline' });
    const { result } = renderHook(() => useBannerDismissal(BANNER_IDS.referral));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.dismiss());

    const next = renderHook(() => useBannerDismissal(BANNER_IDS.referral));
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(next.result.current.dismissed).toBe(true);
  });

  it('keeps every banner id distinct so one dismissal cannot hide another', async () => {
    mockFetchState.mockResolvedValue({
      success: true,
      data: { onboardingCompletedAt: null, dismissedBanners: ['streak'] },
    });
    const streak = renderHook(() => useBannerDismissal(BANNER_IDS.streak));
    const referral = renderHook(() => useBannerDismissal(BANNER_IDS.referral));
    await waitFor(() => expect(streak.result.current.loading).toBe(false));
    await waitFor(() => expect(referral.result.current.loading).toBe(false));

    expect(streak.result.current.dismissed).toBe(true);
    expect(referral.result.current.dismissed).toBe(false);
    expect(new Set(Object.values(BANNER_IDS)).size).toBe(Object.values(BANNER_IDS).length);
  });
});
