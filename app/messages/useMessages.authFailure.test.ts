/**
 * Infinite-spinner regression: auth.getUser used to sit outside
 * loadConversations' try, so a rejected getUser skipped setError and
 * setLoading(false) and /messages spun forever. checkUser now guards the auth
 * call, so a rejection leaves loading false and error set, the condition
 * app/messages/page.tsx uses to render the retry state. Asserts the real hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMessages } from './useMessages';

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

const getUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: () => getUser() },
    // The live-updates effect subscribes to a channel; stub it so it never throws.
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock('@/lib/dal', () => ({
  fetchParticipantSessionIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchSessionsByCreator: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchSessionsByIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchChatMessagesForSessions: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchUserConversations: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getOrCreateDirectConversation: vi.fn().mockResolvedValue({ success: true, data: 'conv' }),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'en' }) }));
vi.mock('@/lib/translations', () => ({ sportTranslations: {} }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showInfo: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

describe('useMessages: auth failure resolves loading and shows the retry state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a rejected getUser leaves loading false and sets error, not a stuck spinner', async () => {
    getUser.mockRejectedValue(new Error('auth failed'));

    const { result } = renderHook(() => useMessages());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('load_failed');
    expect(typeof result.current.retry).toBe('function');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
