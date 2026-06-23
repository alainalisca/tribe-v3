// app/auth/callback/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

let params = new URLSearchParams('code=abc');
vi.mock('next/navigation', () => ({ useSearchParams: () => params }));

const exchangeCodeForSession = vi.fn();
const getSession = vi.fn();
const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { exchangeCodeForSession, getSession, getUser } }),
}));
vi.mock('@/lib/auth-helpers', () => ({ upsertUserProfile: vi.fn().mockResolvedValue({ isNewUser: false }) }));
vi.mock('@/lib/dal/referrals', () => ({ applyReferralCode: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/LoadingSpinner', () => ({ default: () => <div /> }));

import AuthCallbackPage from './page';

describe('AuthCallbackPage — duplicate code', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('does not bounce to /auth when the code was consumed but a session exists', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid request' } });
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    expect(window.location.href).not.toContain('/auth?error');
  });
});
