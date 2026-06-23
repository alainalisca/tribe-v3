// app/auth/useAuthHandlers.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
const resend = vi.fn().mockResolvedValue({ error: null });
const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      signInWithPassword: vi.fn(),
      verifyOtp,
      resend,
      resetPasswordForEmail,
    },
  }),
}));
vi.mock('@/lib/auth-helpers', () => ({ upsertUserProfile: vi.fn().mockResolvedValue({ isNewUser: true }) }));
vi.mock('@/lib/dal/referrals', () => ({ applyReferralCode: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { useAuthHandlers } from './useAuthHandlers';
import { getAuthTranslations } from './translations';

describe('useAuthHandlers — OTP verify', () => {
  beforeEach(() => {
    verifyOtp.mockClear();
    resend.mockClear();
    resetPasswordForEmail.mockClear();
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('signup success enters verify mode and stores the email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    const { result } = renderHook(() => useAuthHandlers('en'));
    act(() => {
      result.current.setIsLogin(false);
      result.current.setEmail('ana@example.com');
      result.current.setPassword('password1');
      result.current.setName('Ana');
      result.current.setBirthDate('1990-01-01');
      result.current.setAcceptedTos(true);
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault() {} } as React.FormEvent);
    });
    expect(result.current.verifyMode).toBe('signup');
    expect(result.current.otpEmail).toBe('ana@example.com');
  });

  it('handleVerifyCode calls verifyOtp with type signup and redirects new users to onboarding', async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const { result } = renderHook(() => useAuthHandlers('en'));
    act(() => {
      result.current.setIsLogin(false);
      result.current.setEmail('ana@example.com');
      result.current.setOtpCode('123456');
    });
    // Force verify mode without re-running signup:
    await act(async () => {
      await result.current.handleVerifyCode({ preventDefault() {} } as React.FormEvent);
    });
    expect(verifyOtp).toHaveBeenCalledWith({ email: '', token: '123456', type: 'signup' });
    expect(window.location.href).toBe('/onboarding/role');
  });

  it('handleResendVerification in signup mode calls resend with type signup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    const { result } = renderHook(() => useAuthHandlers('en'));
    // Go through the signup flow to land in signup verify mode
    act(() => {
      result.current.setIsLogin(false);
      result.current.setEmail('ana@example.com');
      result.current.setPassword('password1');
      result.current.setName('Ana');
      result.current.setBirthDate('1990-01-01');
      result.current.setAcceptedTos(true);
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault() {} } as React.FormEvent);
    });
    expect(result.current.verifyMode).toBe('signup');
    expect(result.current.otpEmail).toBe('ana@example.com');

    await act(async () => {
      await result.current.handleResendVerification();
    });
    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'ana@example.com' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('handleResendVerification in recovery mode calls resetPasswordForEmail and not resend', async () => {
    const { result } = renderHook(() => useAuthHandlers('en'));
    // Go through the forgot-password flow to land in recovery verify mode
    act(() => {
      result.current.setEmail('ana@example.com');
    });
    await act(async () => {
      await result.current.handleForgotPassword();
    });
    expect(result.current.verifyMode).toBe('recovery');
    expect(result.current.otpEmail).toBe('ana@example.com');

    resetPasswordForEmail.mockClear();

    await act(async () => {
      await result.current.handleResendVerification();
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('ana@example.com');
    expect(resend).not.toHaveBeenCalled();
  });

  it('shows a sign-in nudge when the URL carries an invalid/expired link error', async () => {
    // Set BEFORE rendering: the errorParam effect runs on mount.
    // (mockSearchParams is the mutable URLSearchParams from the top of this file.)
    mockSearchParams = new URLSearchParams('error=Email link is invalid or has expired');
    let result: ReturnType<typeof renderHook<ReturnType<typeof useAuthHandlers>, unknown>>;
    await act(async () => {
      result = renderHook(() => useAuthHandlers('es'));
    });
    expect(result!.result.current.message).toBe(getAuthTranslations('es').verifiedSignIn);
    mockSearchParams = new URLSearchParams(); // reset for other tests
  });
});
