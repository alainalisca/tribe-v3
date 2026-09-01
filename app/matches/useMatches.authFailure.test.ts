/**
 * Infinite-spinner regression: checkUser's auth.getUser was unguarded, so a
 * rejection left loading stuck true with no error and the retry state never
 * rendered. Here loading is decoupled (loadData runs from the `user` effect), so
 * checkUser clears loading on failure in its catch rather than a finally, which
 * would flash the loaded state on success. A rejected getUser must leave loading
 * false and error set, the condition app/matches/page.tsx uses to show retry.
 * Asserts the real hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMatches } from './useMatches';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const getUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => getUser() },
  }),
}));

vi.mock('@/lib/dal', () => ({
  fetchSessionsByCreator: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchSessionsByIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchParticipantsForSessions: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchConfirmedParticipations: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'en' }) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

describe('useMatches: auth failure resolves loading and shows the retry state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a rejected getUser leaves loading false and sets error, not a stuck spinner', async () => {
    getUser.mockRejectedValue(new Error('auth failed'));

    const { result } = renderHook(() => useMatches());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('load_failed');
    expect(typeof result.current.retry).toBe('function');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
