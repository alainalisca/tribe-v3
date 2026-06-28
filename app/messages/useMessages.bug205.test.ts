/**
 * BUG-205 regression: When /messages?user=<id> is loaded, the hook should call
 * getOrCreateDirectConversation and navigate to the resulting conversation with
 * router.replace (not router.push, so ?user= is not left in history).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMessages } from './useMessages';

// ── Navigation ──────────────────────────────────────────────────────────────
const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

// ── DAL ─────────────────────────────────────────────────────────────────────
const mockGetOrCreate = vi.fn();

vi.mock('@/lib/dal', () => ({
  fetchParticipantSessionIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchSessionsByCreator: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchSessionsByIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchChatMessagesForSessions: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchUserConversations: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getOrCreateDirectConversation: (...args: unknown[]) => mockGetOrCreate(...args),
}));

// ── Supabase ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'current-user-id' } } }),
    },
  }),
}));

// ── i18n ─────────────────────────────────────────────────────────────────────
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'en' }),
}));

vi.mock('@/lib/translations', () => ({ sportTranslations: {} }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showInfo: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('useMessages — BUG-205: ?user= entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getOrCreateDirectConversation and routes via replace when targetUserId is set', async () => {
    mockGetOrCreate.mockResolvedValue({ success: true, data: 'conv-abc' });

    renderHook(() => useMessages({ targetUserId: 'other-user-id' }));

    await waitFor(() => {
      expect(mockGetOrCreate).toHaveBeenCalledWith(
        expect.anything(), // supabase client
        'current-user-id',
        'other-user-id'
      );
      expect(mockReplace).toHaveBeenCalledWith('/messages/conv-abc');
    });

    // push should NOT be called for the DM redirect
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/messages/'));
  });

  it('does not call getOrCreateDirectConversation when targetUserId is null', async () => {
    renderHook(() => useMessages({ targetUserId: null }));

    // Let the async auth check complete
    await waitFor(() => expect(mockGetOrCreate).not.toHaveBeenCalled());
  });

  it('does not redirect when target is the same as current user (no self-DM)', async () => {
    renderHook(() => useMessages({ targetUserId: 'current-user-id' }));

    await waitFor(() => expect(mockGetOrCreate).not.toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalledWith(expect.stringContaining('/messages/'));
  });

  it('shows an error toast and does not redirect on DAL failure', async () => {
    const { showError } = await import('@/lib/toast');
    mockGetOrCreate.mockResolvedValue({ success: false, error: 'db error' });

    renderHook(() => useMessages({ targetUserId: 'other-user-id' }));

    await waitFor(() => expect(mockGetOrCreate).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalledWith(expect.stringContaining('/messages/'));
    expect(showError).toHaveBeenCalledWith(expect.stringContaining('conversation'));
  });
});
