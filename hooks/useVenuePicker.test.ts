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
const createNotification = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'leo' } } }) } }),
}));
vi.mock('@/lib/dal/users', () => ({
  fetchUserProfileMaybe: async () => ({ success: true, data: { name: 'Leo Garcia' } }),
}));
vi.mock('@/lib/dal/gymVenue', () => ({ setSessionPartner: (...a: unknown[]) => setSessionPartner(...a) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a), log: vi.fn() }));
vi.mock('@/lib/i18n/useTranslations', () => ({
  useTranslations: () => (key: string, v?: Record<string, string | number>) =>
    v ? `${key}: ${Object.values(v).join(' / ')}` : key,
}));
vi.mock('@/lib/dal/notifications', () => ({ createNotification: (...a: unknown[]) => createNotification(...a) }));

import { useVenuePicker } from './useVenuePicker';

const BULLBOX = {
  id: 'p1',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  logo_url: null,
  status: 'active',
  user_id: 'gym-user',
};

beforeEach(() => {
  vi.clearAllMocks();
  createNotification.mockResolvedValue({ success: true });
});

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
    expect(setSessionPartner).toHaveBeenCalledWith(expect.anything(), 's1', 'p1');
  });

  it('passes null to clear, which clears all three columns in the database', async () => {
    setSessionPartner.mockResolvedValue({ success: true, data: null });
    const { result } = renderHook(() => useVenuePicker(BULLBOX));

    act(() => result.current.select(null));
    await act(async () => {
      await result.current.commit('s1');
    });

    expect(setSessionPartner).toHaveBeenCalledWith(expect.anything(), 's1', null);
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

  it('notifies the gym when the request lands pending', async () => {
    setSessionPartner.mockResolvedValue({ success: true, data: 'pending' });
    const { result } = renderHook(() => useVenuePicker());
    act(() => result.current.select(BULLBOX));
    await act(async () => {
      await result.current.commit('s1');
    });

    // A SENTENCE, not a bare business name. The notifications page prints
    // notification.message verbatim and has no per-type case, so a token
    // stored here arrives unreadable -- which is exactly what shipped.
    const call = createNotification.mock.calls[0][1] as { message: string; actor_id: string | null };
    expect(call.actor_id).toBe('leo');
    expect(call.message).toContain('Leo Garcia');
    expect(call.message).toContain('CrossFit BullBox');
    expect(call.message).not.toBe('CrossFit BullBox');
  });

  it('does NOT notify when the link was auto-approved', async () => {
    // The gym already said yes, by hosting it or by leaving auto-approve on.
    setSessionPartner.mockResolvedValue({ success: true, data: 'approved' });
    const { result } = renderHook(() => useVenuePicker());
    act(() => result.current.select(BULLBOX));
    await act(async () => {
      await result.current.commit('s1');
    });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('still reports success when the bell fails', async () => {
    // The request exists and the gym will see it in its queue; a missing
    // notification must not read to the instructor as a failed link.
    setSessionPartner.mockResolvedValue({ success: true, data: 'pending' });
    createNotification.mockResolvedValue({ success: false, error: 'rls' });
    const { result } = renderHook(() => useVenuePicker());
    act(() => result.current.select(BULLBOX));

    let out;
    await act(async () => {
      out = await result.current.commit('s1');
    });
    expect(out).toEqual({ ok: true, status: 'pending' });
    expect(logError).toHaveBeenCalled();
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
