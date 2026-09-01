/**
 * Infinite-spinner regression: auth.getUser used to sit outside loadSessions'
 * try, so a rejected getUser skipped setError and setLoading(false) and the page
 * spun forever. checkUser now guards the auth call, so a rejection leaves loading
 * false and error set, which is exactly the condition app/sessions/page.tsx uses
 * to render the retry state instead of the spinner. Asserts the real hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSessionsData } from './useSessionsData';

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
  fetchParticipationsWithSession: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

describe('useSessionsData: auth failure resolves loading and shows the retry state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a rejected getUser leaves loading false and sets error, not a stuck spinner', async () => {
    getUser.mockRejectedValue(new Error('auth failed'));

    const { result } = renderHook(() => useSessionsData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('load_failed');
    // The page renders the retry state when error is truthy; retry must exist.
    expect(typeof result.current.retry).toBe('function');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
