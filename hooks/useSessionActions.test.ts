import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * Tests for hooks/useSessionActions.
 *
 * Rewritten 2026-04-21. The previous test file duplicated the
 * joinSession coverage that now lives in lib/sessions.test.ts. This
 * file now tests only the hook's own orchestration behavior:
 *
 *   - Anonymous caller (no user) → opens the guest modal, does not
 *     invoke joinSession.
 *   - Authenticated caller → joinSession result 'confirmed' →
 *     celebrates and calls onSessionUpdated.
 *   - Authenticated caller → joinSession result 'pending' → shows
 *     the pending-request toast and calls onSessionUpdated.
 *   - handleCancel sets a confirm dialog; its onConfirm invokes
 *     cancelSession and navigates to /sessions on success.
 *   - handleLeave (BUG-207) → confirm dialog → doLeave removes user
 *     from local state, sets tribe_sessions_dirty flag, navigates home.
 *
 * Everything deeper than that (capacity_full translation, curated
 * vs open, RPC error propagation) is covered in lib/sessions.test.ts.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
}));
vi.mock('@/lib/errorMessages', () => ({
  getErrorMessage: vi.fn(() => 'error'),
}));
vi.mock('@/lib/confetti', () => ({ celebrateJoin: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/sessions', () => ({ joinSession: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  cancelSession: vi.fn(),
  updateParticipantCount: vi.fn(),
  deleteParticipantBySessionAndUser: vi.fn(),
}));
vi.mock('./sessionActionHelpers', () => ({
  insertGuestParticipant: vi.fn(),
  storeGuestLocally: vi.fn(),
  notifyHostOfGuestJoin: vi.fn(),
  sendGuestConfirmationEmail: vi.fn(),
  removeGuestParticipant: vi.fn(),
  checkGuestStatus: vi.fn(),
  removeUserFromSession: vi.fn(),
}));

import { useSessionActions } from './useSessionActions';
import { joinSession } from '@/lib/sessions';
import { cancelSession } from '@/lib/dal';
import { showSuccess, showInfo } from '@/lib/toast';
import { removeUserFromSession } from './sessionActionHelpers';
import type { Session } from '@/lib/database.types';

const fakeSession = {
  id: 'sess-1',
  creator_id: 'creator-1',
  sport: 'bjj',
  status: 'active',
  current_participants: 2,
} as unknown as Session;

function makeParams(userId: string | null = 'user-1') {
  return {
    supabase: {} as never,
    sessionId: 'sess-1',
    session: fakeSession,
    user: userId ? ({ id: userId, email: 'a@b.c', user_metadata: { name: 'Al' } } as never) : null,
    language: 'en' as const,
    onSessionUpdated: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(),
    setParticipants: vi.fn(),
    setSession: vi.fn(),
  };
}

describe('useSessionActions.handleJoin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
  });

  it('opens the guest modal when no user is signed in', async () => {
    const params = makeParams(null);
    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleJoin();
    });

    expect(result.current.showGuestModal).toBe(true);
    expect(joinSession).not.toHaveBeenCalled();
  });

  it('celebrates a confirmed join and calls onSessionUpdated', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'confirmed' } as never);
    const params = makeParams('user-1');
    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleJoin();
    });

    expect(joinSession).toHaveBeenCalledWith({
      supabase: params.supabase,
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Al',
    });
    expect(showSuccess).toHaveBeenCalled();
    expect(params.onSessionUpdated).toHaveBeenCalled();
  });

  it('shows a pending-request toast when the session is curated', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'pending' } as never);
    const params = makeParams('user-1');
    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleJoin();
    });

    expect(showSuccess).toHaveBeenCalled();
    expect(params.onSessionUpdated).toHaveBeenCalled();
  });

  it('surfaces a localized error when joinSession returns a known error code', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: false, error: 'capacity_full' } as never);
    const params = makeParams('user-1');
    const { result } = renderHook(() => useSessionActions(params));

    await act(async () => {
      await result.current.handleJoin();
    });

    expect(showInfo).toHaveBeenCalledWith('This session is full');
    expect(params.onSessionUpdated).not.toHaveBeenCalled();
  });
});

describe('useSessionActions.handleCancel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stages a confirm dialog; running onConfirm invokes cancelSession + navigates', async () => {
    vi.mocked(cancelSession).mockResolvedValue({ success: true } as never);
    const params = makeParams('creator-1');
    const { result } = renderHook(() => useSessionActions(params));

    act(() => {
      result.current.handleCancel();
    });

    expect(result.current.confirmAction).not.toBeNull();
    expect(cancelSession).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmAction!.onConfirm();
    });

    expect(cancelSession).toHaveBeenCalledWith(params.supabase, 'sess-1');
    expect(params.onNavigate).toHaveBeenCalledWith('/sessions');
  });
});

describe('useSessionActions.handleLeave (BUG-207)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the dirty flag before each test.
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('tribe_sessions_dirty');
  });

  it('stages a confirm dialog; onConfirm removes user from local state, sets dirty flag, navigates home', async () => {
    vi.mocked(removeUserFromSession).mockResolvedValue(true as never);
    const params = makeParams('user-1');
    const { result } = renderHook(() => useSessionActions(params));

    act(() => {
      result.current.handleLeave();
    });

    expect(result.current.confirmAction).not.toBeNull();
    expect(removeUserFromSession).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.confirmAction!.onConfirm();
    });

    // DB delete was called (no onNavigate arg — BUG-207 fix).
    expect(removeUserFromSession).toHaveBeenCalledWith(params.supabase, fakeSession, 'user-1');
    // Local state was cleared.
    expect(params.setParticipants).toHaveBeenCalled();
    expect(params.setSession).toHaveBeenCalled();
    // Dirty flag was set so the home feed refetches on return.
    expect(sessionStorage.getItem('tribe_sessions_dirty')).toBe('1');
    // Success toast shown.
    expect(showSuccess).toHaveBeenCalled();
    // Navigates to home, not /sessions.
    expect(params.onNavigate).toHaveBeenCalledWith('/');
  });
});
