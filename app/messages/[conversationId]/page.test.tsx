/**
 * Regression: the DM thread page must read the conversation id from the PATH
 * param via useParams() (Next 16 makes `params` a Promise, so the old sync prop
 * read yielded `undefined` -> conversation_id=eq.undefined -> every DM broken).
 * Also: a missing/invalid id must surface a real error, never fire a query.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import ConversationPage from './page';

const VALID = '11111111-1111-4111-8111-111111111111';

const mockUseParams = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => mockUseParams(),
}));

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'me' } } });
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
  }),
}));

const mockFetchMessages = vi.fn().mockResolvedValue({ success: true, data: [] });
const mockFetchConversations = vi.fn().mockResolvedValue({ success: true, data: [] });
vi.mock('@/lib/dal/conversations', () => ({
  fetchConversationMessages: (...a: unknown[]) => mockFetchMessages(...a),
  markConversationRead: vi.fn().mockResolvedValue({ success: true }),
  sendDirectMessage: vi.fn().mockResolvedValue({ success: true }),
  fetchUserConversations: (...a: unknown[]) => mockFetchConversations(...a),
}));

const mockShowError = vi.fn();
vi.mock('@/lib/toast', () => ({ showError: (...a: unknown[]) => mockShowError(...a) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/components/ChatView', () => ({ default: () => null }));

describe('ConversationPage — path param handling (Next 16)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the conversation id from useParams and queries with the real id (never undefined)', async () => {
    mockUseParams.mockReturnValue({ conversationId: VALID });
    render(<ConversationPage />);
    await waitFor(() => expect(mockFetchMessages).toHaveBeenCalled());
    // second arg is the conversationId
    expect(mockFetchMessages).toHaveBeenCalledWith(expect.anything(), VALID);
    expect(mockFetchMessages).not.toHaveBeenCalledWith(expect.anything(), undefined);
  });

  it('does NOT fire a query when the path param is missing — shows an error instead', async () => {
    mockUseParams.mockReturnValue({}); // no conversationId
    render(<ConversationPage />);
    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(mockFetchMessages).not.toHaveBeenCalled();
  });

  it('does NOT fire a query when the path param is not a valid UUID', async () => {
    mockUseParams.mockReturnValue({ conversationId: 'undefined' });
    render(<ConversationPage />);
    await waitFor(() => expect(mockShowError).toHaveBeenCalled());
    expect(mockFetchMessages).not.toHaveBeenCalled();
  });
});
