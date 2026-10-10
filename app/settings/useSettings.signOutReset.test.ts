/**
 * T-ANALYTICS1 part B: both ways out of an account in Settings detach the
 * PostHog identity before the Supabase session goes. Sign out already did;
 * account deletion did not, so a deleted account's identity stayed on the
 * device for whoever signed in next.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }));
vi.mock('@/lib/i18n/useTranslations', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('@/lib/location', () => ({ requestUserLocation: vi.fn() }));
vi.mock('@/lib/firebase-messaging', () => ({ removeFcmToken: vi.fn() }));
vi.mock('@/lib/dal', () => ({
  fetchUserField: vi.fn().mockResolvedValue({ success: true, data: null }),
  fetchUserIsAdmin: vi.fn().mockResolvedValue({ success: true, data: false }),
  updateUser: vi.fn(),
  fetchMyLocation: vi.fn().mockResolvedValue({ success: true, data: null }),
}));
vi.mock('@/lib/dal/notificationPreferences', () => ({
  getNotificationPreferences: vi.fn().mockResolvedValue({ success: true, data: null }),
  updateNotificationPreferences: vi.fn(),
}));

const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }),
      signOut,
    },
  }),
}));

const resetUser = vi.fn();
vi.mock('@/lib/analytics', () => ({ resetUser: () => resetUser(), trackEvent: vi.fn() }));

import { useSettings } from './useSettings';

function expectResetBeforeSignOut() {
  expect(resetUser).toHaveBeenCalledOnce();
  expect(signOut).toHaveBeenCalled();
  expect(resetUser.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
}

describe('useSettings: leaving the account resets PostHog first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('sign out', async () => {
    const { result } = renderHook(() => useSettings('en'));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await act(async () => {
      await result.current.handleSignOut();
    });
    expectResetBeforeSignOut();
  });

  it('account deletion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    const { result } = renderHook(() => useSettings('en'));
    await waitFor(() => expect(result.current.user).not.toBeNull());
    act(() => result.current.setDeleteInput('DELETE'));
    await act(async () => {
      await result.current.handleDeleteAccount();
    });
    expectResetBeforeSignOut();
    vi.unstubAllGlobals();
  });
});
