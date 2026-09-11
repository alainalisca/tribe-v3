/**
 * The gym's approval queue (T-GYM2).
 *
 * What CI can prove here is the client contract: the right RPC, the row leaving
 * the queue, the instructor notified, the toggle rolling back. What it CANNOT
 * prove is that another instructor is refused -- that lives in
 * review_venue_request's ownership check inside the database, and every DAL
 * call in this repo is mocked. That one needs a live probe and is listed in the
 * PR as Al's to run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fetchVenueRequests = vi.fn();
const reviewVenueRequest = vi.fn();
const setAutoApproveRoster = vi.fn();
const createNotification = vi.fn();
const trackEvent = vi.fn();
const logError = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/venueRequests', () => ({ fetchVenueRequests: (...a: unknown[]) => fetchVenueRequests(...a) }));
vi.mock('@/lib/dal/gymVenue', () => ({
  reviewVenueRequest: (...a: unknown[]) => reviewVenueRequest(...a),
  setAutoApproveRoster: (...a: unknown[]) => setAutoApproveRoster(...a),
}));
vi.mock('@/lib/dal/notifications', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a), log: vi.fn() }));

import { useVenueRequests } from './useVenueRequests';

const REQUEST = {
  sessionId: 's1',
  title: 'Morning CrossFit',
  sport: 'CrossFit',
  date: '2026-09-20',
  startTime: '06:00',
  duration: 60,
  isPaid: false,
  priceCents: null,
  currency: 'COP',
  instructor: { id: 'leo', name: 'Leo Garcia', avatarUrl: null, averageRating: 4.8, totalSessionsHosted: 17 },
  notOnRoster: true,
  requestedAt: '2026-09-19T06:00:00Z',
};

const ARGS = { partnerId: 'p1', gymName: 'CrossFit BullBox', gymUserId: 'gym-user', initialAutoApprove: true };

beforeEach(() => {
  vi.clearAllMocks();
  fetchVenueRequests.mockResolvedValue({ success: true, data: [REQUEST] });
  reviewVenueRequest.mockResolvedValue({ success: true });
  setAutoApproveRoster.mockResolvedValue({ success: true });
  createNotification.mockResolvedValue({ success: true });
});

async function mounted() {
  const hook = renderHook(() => useVenueRequests(ARGS));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useVenueRequests', () => {
  it('approving goes through the RPC, never a column write', async () => {
    const { result } = await mounted();
    await act(async () => {
      await result.current.decide(REQUEST, 'approved');
    });
    expect(reviewVenueRequest).toHaveBeenCalledWith({}, 's1', 'approved');
  });

  it('removes the row from the queue either way', async () => {
    const { result } = await mounted();
    await act(async () => {
      await result.current.decide(REQUEST, 'declined');
    });
    expect(result.current.requests).toEqual([]);
  });

  it('leaves the row in place when the RPC refuses', async () => {
    // The refusal a non-owner gets from the database must not look like success.
    reviewVenueRequest.mockResolvedValue({ success: false, error: 'only the venue owner can review this request' });
    const { result } = await mounted();

    let ok;
    await act(async () => {
      ok = await result.current.decide(REQUEST, 'approved');
    });
    expect(ok).toBe(false);
    expect(result.current.requests).toHaveLength(1);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notifies the instructor of the verdict', async () => {
    const { result } = await mounted();
    await act(async () => {
      await result.current.decide(REQUEST, 'declined');
    });
    expect(createNotification).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ recipient_id: 'leo', type: 'venue_request_declined', entity_id: 's1' })
    );
  });

  it('keeps the verdict when the bell fails', async () => {
    // The decision is already recorded in the database; a failed notification
    // must not undo it or report failure to the gym.
    createNotification.mockResolvedValue({ success: false, error: 'rls' });
    const { result } = await mounted();

    let ok;
    await act(async () => {
      ok = await result.current.decide(REQUEST, 'approved');
    });
    expect(ok).toBe(true);
    expect(result.current.requests).toEqual([]);
    expect(logError).toHaveBeenCalled();
  });

  it('rolls the toggle back when the write fails', async () => {
    setAutoApproveRoster.mockResolvedValue({ success: false, error: 'denied' });
    const { result } = await mounted();
    expect(result.current.autoApprove).toBe(true);

    await act(async () => {
      await result.current.toggleAutoApprove(false);
    });
    // An optimistic switch that silently stays flipped would tell the gym its
    // roster skips the queue when it does not.
    expect(result.current.autoApprove).toBe(true);
  });

  it('keeps the toggle when the write succeeds', async () => {
    const { result } = await mounted();
    await act(async () => {
      await result.current.toggleAutoApprove(false);
    });
    expect(result.current.autoApprove).toBe(false);
    expect(setAutoApproveRoster).toHaveBeenCalledWith({}, 'p1', false);
  });

  it('shows an empty queue rather than an error when the read fails', async () => {
    fetchVenueRequests.mockResolvedValue({ success: false, error: '42501' });
    const { result } = await mounted();
    expect(result.current.requests).toEqual([]);
    expect(logError).toHaveBeenCalled();
  });
});
