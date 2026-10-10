/**
 * T-ANALYTICS1: which join event the hook fires, by joinSession's answer.
 *
 * Found on the preview (2026-10-10): on a CURATED session, joinSession stored
 * the request as 'pending', so session_joined correctly did not fire -- but
 * nothing else did either. PostHog showed session_join_clicked and then
 * silence, which reads as a broken join. A pending request now fires
 * session_join_requested, and still never session_joined: the person is not
 * in until the host accepts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }));
vi.mock('@/lib/errorMessages', () => ({ getErrorMessage: vi.fn(() => 'error') }));
vi.mock('@/lib/confetti', () => ({ celebrateJoin: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/sessions', () => ({ joinSession: vi.fn() }));
vi.mock('@/lib/dal/athleteSetup', () => ({
  needsAthleteSetup: vi.fn().mockResolvedValue({ success: true, data: false }),
}));
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
  notifyHostOfLeave: vi.fn(),
}));
vi.mock('@/lib/sessionAnalytics', () => ({
  trackSessionJoined: vi.fn().mockResolvedValue(undefined),
  trackSessionJoinRequested: vi.fn(),
  trackSessionLeft: vi.fn(),
}));

import { useSessionActions } from './useSessionActions';
import { joinSession } from '@/lib/sessions';
import { trackEvent } from '@/lib/analytics';
import { trackSessionJoined, trackSessionJoinRequested, trackSessionLeft } from '@/lib/sessionAnalytics';
import { removeUserFromSession } from './sessionActionHelpers';
import type { Session } from '@/lib/database.types';

const curated = {
  id: 'sess-1',
  creator_id: 'creator-1',
  sport: 'Other',
  status: 'active',
  join_policy: 'curated',
  is_paid: false,
  price_cents: null,
  current_participants: 0,
} as unknown as Session;

function params() {
  return {
    supabase: {} as never,
    sessionId: 'sess-1',
    session: curated,
    user: { id: 'user-1', email: 'a@b.c', user_metadata: { name: 'Al' } } as never,
    language: 'es' as const,
    onSessionUpdated: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(),
    setParticipants: vi.fn(),
    setSession: vi.fn(),
  };
}

async function join() {
  const { result } = renderHook(() => useSessionActions(params()));
  await act(async () => {
    await result.current.handleJoin();
  });
}

beforeEach(() => vi.clearAllMocks());

describe('join analytics by joinSession result', () => {
  it('a PENDING request (curated session) fires session_join_requested, never session_joined', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'pending' });
    await join();
    expect(trackSessionJoinRequested).toHaveBeenCalledWith(curated);
    expect(trackSessionJoined).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalledWith('session_join_succeeded', expect.anything());
  });

  it('a CONFIRMED join fires session_joined (and session_join_succeeded), not a request', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'confirmed' });
    await join();
    expect(trackSessionJoined).toHaveBeenCalledWith({}, curated, 'user-1');
    expect(trackEvent).toHaveBeenCalledWith('session_join_succeeded', expect.anything());
    expect(trackSessionJoinRequested).not.toHaveBeenCalled();
  });

  it('a failed join fires session_join_failed and neither of the others', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: false, error: 'already_joined' });
    await join();
    expect(trackEvent).toHaveBeenCalledWith('session_join_failed', { session_id: 'sess-1', reason: 'already_joined' });
    expect(trackSessionJoined).not.toHaveBeenCalled();
    expect(trackSessionJoinRequested).not.toHaveBeenCalled();
  });
});

describe('leave analytics', () => {
  it('fires session_left only after the leave succeeded', async () => {
    vi.mocked(removeUserFromSession).mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useSessionActions(params()));
    act(() => result.current.handleLeave());
    await act(async () => {
      await result.current.confirmAction?.onConfirm();
    });
    expect(trackSessionLeft).toHaveBeenCalledWith('sess-1');
    expect(vi.mocked(removeUserFromSession).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(trackSessionLeft).mock.invocationCallOrder[0]
    );
  });

  it('does not fire session_left when the leave fails', async () => {
    vi.mocked(removeUserFromSession).mockRejectedValue(new Error('rls'));
    const { result } = renderHook(() => useSessionActions(params()));
    act(() => result.current.handleLeave());
    await act(async () => {
      await result.current.confirmAction?.onConfirm();
    });
    expect(trackSessionLeft).not.toHaveBeenCalled();
  });
});
