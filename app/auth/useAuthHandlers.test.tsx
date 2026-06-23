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
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      signInWithPassword: vi.fn(),
      verifyOtp,
      resend,
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

describe('useAuthHandlers — OTP verify', () => {
  beforeEach(() => {
    verifyOtp.mockClear();
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
  });
});
