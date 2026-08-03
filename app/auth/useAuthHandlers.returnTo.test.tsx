/**
 * T-C1 Gate 2: returnTo survival through the auth handlers.
 * - New-user signup parks returnTo in sessionStorage for onboarding to consume.
 * - Invalid / protocol-relative values fall back to the exact old behavior.
 * - The already-signed-in guard honors a validated returnTo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

let mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

const verifyOtp = vi.fn();
const getUser = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser,
      signInWithPassword: vi.fn(),
      verifyOtp,
      resend: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));
const upsertUserProfile = vi.fn();
vi.mock('@/lib/auth-helpers', () => ({ upsertUserProfile: (...a: unknown[]) => upsertUserProfile(...a) }));
vi.mock('@/lib/dal/referrals', () => ({ applyReferralCode: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { useAuthHandlers } from './useAuthHandlers';

const STORAGE_KEY = 'tribe_pending_return_to';
const INVITE_PATH = '/invite/abc123def456';

async function verifyAsUser(isNewUser: boolean) {
  verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  upsertUserProfile.mockResolvedValue({ isNewUser });
  const { result } = renderHook(() => useAuthHandlers('en'));
  act(() => {
    result.current.setOtpCode('123456');
  });
  await act(async () => {
    await result.current.handleVerifyCode({ preventDefault() {} } as React.FormEvent);
  });
}

describe('useAuthHandlers — returnTo survival (T-C1 Gate 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    getUser.mockResolvedValue({ data: { user: null } });
    Object.defineProperty(window, 'location', {
      value: { href: '', origin: 'http://localhost' },
      writable: true,
    });
  });

  it('new-user OTP signup parks the returnTo and still lands on onboarding', async () => {
    mockSearchParams = new URLSearchParams(`returnTo=${encodeURIComponent(INVITE_PATH)}`);
    await verifyAsUser(true);
    expect(window.location.href).toBe('/onboarding/role');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(INVITE_PATH);
  });

  it('existing-user OTP verify goes straight to returnTo and parks nothing', async () => {
    mockSearchParams = new URLSearchParams(`returnTo=${encodeURIComponent(INVITE_PATH)}`);
    await verifyAsUser(false);
    expect(window.location.href).toBe(INVITE_PATH);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('protocol-relative returnTo is dropped: default redirect, nothing parked', async () => {
    mockSearchParams = new URLSearchParams(`returnTo=${encodeURIComponent('//evil.com/phish')}`);
    await verifyAsUser(true);
    expect(window.location.href).toBe('/onboarding/role');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('absent returnTo keeps the exact old behavior for new users', async () => {
    mockSearchParams = new URLSearchParams();
    await verifyAsUser(true);
    expect(window.location.href).toBe('/onboarding/role');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('already-signed-in guard replaces to the validated returnTo', async () => {
    mockSearchParams = new URLSearchParams(`returnTo=${encodeURIComponent(INVITE_PATH)}`);
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    renderHook(() => useAuthHandlers('en'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(INVITE_PATH));
  });

  it('already-signed-in guard falls back to home for an invalid returnTo', async () => {
    mockSearchParams = new URLSearchParams('returnTo=https%3A%2F%2Fevil.com');
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    renderHook(() => useAuthHandlers('en'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });
});
