/**
 * T-C1 Gate 1 regression tests for /invite/[token]:
 * 1. The logged-out branch offers sign-in with a URL-encoded returnTo back to
 *    this invite, alongside the guest form.
 * 2. A getUser() rejection (network blip during login detection) degrades to
 *    the logged-out branch — it must never paint a valid invite as invalid.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';

const TOKEN = 'abc123def456abc123def456abc12345';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ token: TOKEN }),
}));

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser }, rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

vi.mock('@/lib/dal', () => ({
  fetchUsersByIds: vi.fn().mockResolvedValue({
    success: true,
    data: [{ id: 'host-1', name: 'Host', avatar_url: null }],
  }),
}));
vi.mock('@/lib/sessions', () => ({ joinSession: vi.fn() }));

const mockShowError = vi.fn();
vi.mock('@/lib/toast', () => ({
  showError: (...a: unknown[]) => mockShowError(...a),
  showSuccess: vi.fn(),
  showInfo: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
// Identity translators: assertions reference keys, not copy, so EN/ES edits
// don't break these tests.
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (k: string) => k }),
}));
vi.mock('@/lib/i18n/useTranslations', () => ({ useTranslations: () => (k: string) => k }));

// The Gate 1 behavior moved into the client half when page.tsx became a
// server component (invite preview metadata). These tests mount InviteClient
// with initialInvite={null} — the server-fetch-failed fallback path — which is
// byte-equal to the pre-split client behavior the tests were written against.
import InviteClient from './InviteClient';

function renderInvitePage() {
  return render(<InviteClient token={TOKEN} initialInvite={null} />);
}

const VALID_INVITE = {
  valid: true,
  session_id: 's1',
  created_by: 'host-1',
  expires_at: null,
  session: {
    id: 's1',
    sport: 'Running',
    title: null,
    date: '2026-08-01',
    start_time: '07:00',
    duration: 60,
    description: null,
    location: 'Parque de los Deseos',
    location_lat: null,
    location_lng: null,
    is_paid: false,
    price_cents: null,
    currency: null,
    current_participants: 1,
    max_participants: 10,
    join_policy: 'invite_only',
  },
};

describe('InvitePage — T-C1 Gate 1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: VALID_INVITE, error: null });
  });

  it('logged-out branch links sign-in to /auth with the URL-encoded invite returnTo', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    renderInvitePage();

    const signIn = await screen.findByText('signInToAccept');
    const link = signIn.closest('a');
    expect(link).not.toBeNull();
    // The returnTo target carries a trailing slash (trailingSlash:true canonical
    // form), matching the sibling share funnel; a no-slash returnTo would force a
    // post-login 308 hop.
    expect(link?.getAttribute('href')).toBe(`/auth?returnTo=${encodeURIComponent(`/invite/${TOKEN}/`)}`);
    // Sanity-check the encoding itself: the path must not survive un-encoded.
    expect(link?.getAttribute('href')).toBe(`/auth?returnTo=%2Finvite%2F${TOKEN}%2F`);

    // The guest form is still offered next to it.
    expect(screen.getByText('confirmYourSpot')).toBeTruthy();
    expect(screen.getByText('joinWithoutAccount')).toBeTruthy();
  });

  it('getUser() rejection degrades to the logged-out branch, not the error state', async () => {
    mockGetUser.mockRejectedValue(new Error('network down'));
    renderInvitePage();

    // The valid invite renders with both logged-out options...
    await screen.findByText('signInToAccept');
    expect(screen.getByText('confirmYourSpot')).toBeTruthy();
    // ...token validation still ran...
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('validate_invite_token', { p_token: TOKEN }));
    // ...and neither error surface fired: no toast, no "not found" screen.
    expect(mockShowError).not.toHaveBeenCalled();
    expect(screen.queryByText('inviteNotFound')).toBeNull();
  });

  it('logged-in visitor still gets the accept branch, never the guest form', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.co', user_metadata: { name: 'Ana' } } },
      error: null,
    });
    renderInvitePage();

    await screen.findByText('acceptInvitation');
    expect(screen.queryByText('signInToAccept')).toBeNull();
    expect(screen.queryByText('confirmYourSpot')).toBeNull();
  });
});
