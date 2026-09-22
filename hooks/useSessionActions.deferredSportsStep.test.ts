/**
 * DEFER THE SPORTS STEP, DO NOT SKIP IT (2026-09-21).
 *
 * An athlete arriving through a share link has a returnTo parked, so
 * /onboarding/role sends them to the session and never shows the sports step.
 * That is correct -- sending someone who tapped an invite to a form instead of
 * the session they were invited to is how you lose them. The cost was that the
 * share funnel produced athletes with no sports, invisible to
 * find_training_partners and to /instructors.
 *
 * So the ask moves to the moment AFTER the join, with returnTo pointing back
 * at the session. This file is the second half of that: the first half -- the
 * session winning over the sports step -- is in app/onboarding/role/page.test.tsx.
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
vi.mock('@/lib/dal/athleteSetup', () => ({ needsAthleteSetup: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  cancelSession: vi.fn(),
  cancelFutureChildren: vi.fn(),
  endRecurringSeries: vi.fn(),
  seriesParentId: vi.fn(),
  deleteParticipantBySessionAndUser: vi.fn(),
}));
vi.mock('./sessionActionHelpers', () => ({
  insertGuestParticipant: vi.fn(),
  storeGuestLocally: vi.fn(),
  notifyHostOfGuestJoin: vi.fn(),
  notifyHostOfLeave: vi.fn(),
  sendGuestConfirmationEmail: vi.fn(),
  removeGuestParticipant: vi.fn(),
  checkGuestStatus: vi.fn(),
  removeUserFromSession: vi.fn(),
}));

import { useSessionActions } from './useSessionActions';
import { joinSession } from '@/lib/sessions';
import { needsAthleteSetup } from '@/lib/dal/athleteSetup';
import type { Session } from '@/lib/database.types';

const SESSION_ID = 'sess-1';
const fakeSession = { id: SESSION_ID, creator_id: 'creator-1', sport: 'bjj', status: 'active' } as unknown as Session;

function makeParams() {
  return {
    supabase: {} as never,
    sessionId: SESSION_ID,
    session: fakeSession,
    user: { id: 'user-1', email: 'a@b.c', user_metadata: { name: 'Al' } } as never,
    language: 'en' as const,
    onSessionUpdated: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(),
    setParticipants: vi.fn(),
    setSession: vi.fn(),
  };
}

async function join(params: ReturnType<typeof makeParams>) {
  const { result } = renderHook(() => useSessionActions(params));
  await act(async () => {
    await result.current.handleJoin();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true }) as never;
});

describe('the sports step is asked for right after joining', () => {
  it('NON-VACUITY: joinSession is actually reached on this path', async () => {
    // Without this, a handleJoin that returns early -- no user, a guard, a
    // throw -- satisfies every "did not navigate" assertion below.
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'confirmed' } as never);
    vi.mocked(needsAthleteSetup).mockResolvedValue({ success: true, data: false });
    const params = makeParams();
    await join(params);
    expect(joinSession).toHaveBeenCalledOnce();
    expect(params.onSessionUpdated).toHaveBeenCalledOnce();
  });

  it('an athlete with no sports is sent to the step, and back to the session after', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'confirmed' } as never);
    vi.mocked(needsAthleteSetup).mockResolvedValue({ success: true, data: true });
    const params = makeParams();
    await join(params);
    expect(params.onNavigate).toHaveBeenCalledWith(
      `/onboarding/sports?returnTo=${encodeURIComponent(`/session/${SESSION_ID}`)}`
    );
  });

  it('the join happens FIRST -- the step is never asked before the session is joined', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'confirmed' } as never);
    vi.mocked(needsAthleteSetup).mockResolvedValue({ success: true, data: true });
    const params = makeParams();
    await join(params);
    // Defer means ordering, and ordering is the requirement. A version that
    // asked first would still navigate to the right URL and pass the case above.
    const joinOrder = vi.mocked(joinSession).mock.invocationCallOrder[0];
    const navOrder = params.onNavigate.mock.invocationCallOrder[0];
    expect(joinOrder).toBeLessThan(navOrder);
  });

  it('a PENDING request asks too -- a curated host reads the profile before deciding', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'pending' } as never);
    vi.mocked(needsAthleteSetup).mockResolvedValue({ success: true, data: true });
    const params = makeParams();
    await join(params);
    expect(params.onNavigate).toHaveBeenCalledWith(
      `/onboarding/sports?returnTo=${encodeURIComponent(`/session/${SESSION_ID}`)}`
    );
  });

  it('an athlete who already has sports is left alone', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'confirmed' } as never);
    vi.mocked(needsAthleteSetup).mockResolvedValue({ success: true, data: false });
    const params = makeParams();
    await join(params);
    expect(params.onNavigate).not.toHaveBeenCalled();
  });

  it('a FAILED read does not interrupt the join', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: true, status: 'confirmed' } as never);
    vi.mocked(needsAthleteSetup).mockResolvedValue({ success: false, error: 'boom' });
    const params = makeParams();
    await join(params);
    // success:false carries data:undefined. Reading .data without checking
    // .success would make an errored read indistinguishable from "not needed"
    // here and from "needed" under a different falsy convention -- the
    // swallowed-failure shape. The home-feed banner still catches them.
    expect(params.onNavigate).not.toHaveBeenCalled();
  });

  it('a FAILED join never asks -- there is nothing to come back to', async () => {
    vi.mocked(joinSession).mockResolvedValue({ success: false, error: 'capacity_full' } as never);
    vi.mocked(needsAthleteSetup).mockResolvedValue({ success: true, data: true });
    const params = makeParams();
    await join(params);
    expect(needsAthleteSetup).not.toHaveBeenCalled();
    expect(params.onNavigate).not.toHaveBeenCalled();
  });
});
