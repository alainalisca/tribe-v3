/**
 * The venue link (T-GYM2).
 *
 * The case worth pinning is failure. On create the session is inserted BEFORE
 * the RPC runs, so if a link failure threw, it would land in the create page's
 * catch block and tell the instructor "session creation failed" about a session
 * that exists. commit() must therefore never throw and must report the two
 * outcomes apart.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const setSessionPartner = vi.fn();
const trackEvent = vi.fn();
const logError = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/gymVenue', () => ({ setSessionPartner: (...a: unknown[]) => setSessionPartner(...a) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a), log: vi.fn() }));

import { useVenuePicker } from './useVenuePicker';

const BULLBOX = {
  id: 'p1',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  logo_url: null,
  status: 'active',
  user_id: 'gym-user',
};

beforeEach(() => vi.clearAllMocks());

describe('useVenuePicker', () => {
  it('reports the status the database decided, never one of its own', async () => {
    setSessionPartner.mockResolvedValue({ success: true, data: 'pending' });
    const { result } = renderHook(() => useVenuePicker());

    act(() => result.current.select(BULLBOX));
    let out;
    await act(async () => {
      out = await result.current.commit('s1');
    });

    expect(out).toEqual({ ok: true, status: 'pending' });
    expect(result.current.status).toBe('pending');
    // The status is not among the arguments -- the RPC computes it.
    expect(setSessionPartner).toHaveBeenCalledWith({}, 's1', 'p1');
  });

  it('passes null to clear, which clears all three columns in the database', async () => {
    setSessionPartner.mockResolvedValue({ success: true, data: null });
    const { result } = renderHook(() => useVenuePicker(BULLBOX));

    act(() => result.current.select(null));
    await act(async () => {
      await result.current.commit('s1');
    });

    expect(setSessionPartner).toHaveBeenCalledWith({}, 's1', null);
  });

  it('does NOT throw when the link fails, so the create page cannot mislabel it', async () => {
    // The regression this file exists for: a throw here surfaces as
    // "session creation failed" for a session that was created.
    setSessionPartner.mockResolvedValue({ success: false, error: 'permission denied' });
    const { result } = renderHook(() => useVenuePicker());

    act(() => result.current.select(BULLBOX));
    let out;
    await act(async () => {
      out = await result.current.commit('s1');
    });

    expect(out).toEqual({ ok: false, status: null, errorKey: 'venueLinkFailed' });
    expect(result.current.failed).toBe(true);
    expect(logError).toHaveBeenCalled();
  });

  it('survives a rejected promise the same way, rather than propagating it', async () => {
    // The first version of this test asserted commit() rejects, which
    // contradicted the contract two paragraphs above it in the hook. A throw
    // here lands in the create page's catch and mislabels a created session.
    setSessionPartner.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useVenuePicker());
    act(() => result.current.select(BULLBOX));

    let out;
    await act(async () => {
      out = await result.current.commit('s1');
    });

    expect(out).toEqual({ ok: false, status: null, errorKey: 'venueLinkFailed' });
    expect(result.current.failed).toBe(true);
    expect(result.current.linking).toBe(false);
  });

  it('clears a stale verdict when the instructor picks a different gym', async () => {
    setSessionPartner.mockResolvedValue({ success: true, data: 'pending' });
    const { result } = renderHook(() => useVenuePicker());
    act(() => result.current.select(BULLBOX));
    await act(async () => {
      await result.current.commit('s1');
    });
    expect(result.current.status).toBe('pending');

    // Showing "pending" for a gym they just swapped away from would be a lie.
    act(() => result.current.select({ ...BULLBOX, id: 'p2', business_name: 'Other Gym' }));
    expect(result.current.status).toBeNull();
  });

  it('tracks venue_selected with what the database decided', async () => {
    setSessionPartner.mockResolvedValue({ success: true, data: 'approved' });
    const { result } = renderHook(() => useVenuePicker());
    act(() => result.current.select(BULLBOX));
    await act(async () => {
      await result.current.commit('s1');
    });

    expect(trackEvent).toHaveBeenCalledWith('venue_selected', {
      session_id: 's1',
      partner_id: 'p1',
      auto_approved: true,
    });
  });

  it('tracks nothing when the venue was cleared rather than chosen', async () => {
    setSessionPartner.mockResolvedValue({ success: true, data: null });
    const { result } = renderHook(() => useVenuePicker());
    await act(async () => {
      await result.current.commit('s1');
    });
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
