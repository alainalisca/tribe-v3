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

import { useQuickGuide } from './useQuickGuide';

const USER = { data: { user: { id: 'u1' } } };

/** Never resolves — models the answer still being in flight. */
const pending = () => new Promise(() => {});

beforeEach(() => {
  window.localStorage.clear();
  mockGetUser.mockReset().mockResolvedValue(USER);
  mockFetchState
    .mockReset()
    .mockResolvedValue({ success: true, data: { onboardingCompletedAt: null, dismissedBanners: [] } });
  mockDismiss.mockReset().mockResolvedValue({ success: true });
});

afterEach(() => vi.clearAllMocks());

describe('useQuickGuide: unknown renders nothing', () => {
  it('stays closed while the answer is still loading', async () => {
    mockFetchState.mockImplementation(pending);
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    // The old bug: it auto-opened during this window, before the answer existed.
    expect(result.current.open).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  it('stays closed when the state cannot be read at all', async () => {
    mockFetchState.mockResolvedValue({ success: false, error: 'boom' });
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Unknown is not "unseen": a failed read must not re-prompt someone who
    // already dismissed it.
    expect(result.current.open).toBe(false);
  });

  it('stays closed for a signed-out visitor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.open).toBe(false);
  });
});

describe('useQuickGuide: a completed athlete sees nothing', () => {
  it('does not open when the server says this guide was dismissed', async () => {
    mockFetchState.mockResolvedValue({
      success: true,
      data: { onboardingCompletedAt: '2026-01-01T00:00:00Z', dismissedBanners: ['tribe-welcome'] },
    });
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.open).toBe(false);
    expect(result.current.seen).toBe(true);
  });

  it('opens for someone who has never seen it', async () => {
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(result.current.open).toBe(true));
  });

  it('does not re-open on a remount, which is what showed the tour twice', async () => {
    const first = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(first.result.current.open).toBe(true));
    act(() => first.result.current.close());
    first.unmount();

    // The server now knows, and so does the local mirror.
    mockFetchState.mockResolvedValue({
      success: true,
      data: { onboardingCompletedAt: null, dismissedBanners: ['tribe-welcome'] },
    });
    const second = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.open).toBe(false);
  });
});

describe('useQuickGuide: dismissal persists', () => {
  it('writes to the server and to the local mirror in the same action', async () => {
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(result.current.open).toBe(true));

    act(() => result.current.close());

    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem('tribe_guide_seen_tribe-welcome')).toBe('1');
    await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith(expect.anything(), 'tribe-welcome'));
  });

  it('survives a failed server write, because the mirror already holds', async () => {
    mockDismiss.mockResolvedValue({ success: false, error: 'offline' });
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => result.current.close());

    // Next load: the mirror answers before the server is ever consulted.
    const next = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(next.result.current.loading).toBe(false));
    expect(next.result.current.open).toBe(false);
  });

  it('trusts the local mirror without waiting for the network', async () => {
    window.localStorage.setItem('tribe_guide_seen_tribe-welcome', '1');
    mockFetchState.mockImplementation(pending);
    const { result } = renderHook(() => useQuickGuide('tribe-welcome'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.open).toBe(false);
    expect(mockFetchState).not.toHaveBeenCalled();
  });
});
