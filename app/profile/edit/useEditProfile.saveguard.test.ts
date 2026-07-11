import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// BUG-010: the whole point of the ticket — handleSave must NOT write when the
// profile never successfully loaded (a transient failure leaves the form empty,
// and a Save would overwrite the real row with blanks).

const { mockFetchUserProfile, mockUpdateUser, mockFetchMyPrivate, mockUpsertMyPrivate, mockGetUser } = vi.hoisted(
  () => ({
    mockFetchUserProfile: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockFetchMyPrivate: vi.fn(),
    mockUpsertMyPrivate: vi.fn(),
    mockGetUser: vi.fn(),
  })
);

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser }, storage: { from: () => ({}) } }),
}));
vi.mock('@/lib/dal', () => ({
  fetchUserProfile: (...a: unknown[]) => mockFetchUserProfile(...a),
  updateUser: (...a: unknown[]) => mockUpdateUser(...a),
}));
vi.mock('@/lib/dal/userPrivate', () => ({
  fetchMyPrivateProfile: (...a: unknown[]) => mockFetchMyPrivate(...a),
  upsertMyPrivateProfile: (...a: unknown[]) => mockUpsertMyPrivate(...a),
}));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn(), showInfo: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/errorMessages', () => ({ getErrorMessage: () => 'err' }));
vi.mock('./translations', () => ({ getEditProfileTranslations: () => ({}) }));
vi.mock('@/components/stories/storyUploadHelpers', () => ({ compressImage: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

import { useEditProfile } from './useEditProfile';

const REAL_PROFILE = { id: 'u1', name: 'Real Name', bio: 'Real bio', sports: ['Running'], photos: ['p.jpg'] };

describe('useEditProfile — BUG-010 save guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFetchMyPrivate.mockResolvedValue({ success: true, data: null });
    mockUpdateUser.mockResolvedValue({ success: true, data: null });
    mockUpsertMyPrivate.mockResolvedValue({ success: true, data: true });
  });

  it('does NOT call updateUser when the profile load FAILED (guards the wipe)', async () => {
    // Transient failure: DAL returns success=false (it does not throw).
    mockFetchUserProfile.mockResolvedValue({ success: false, error: 'network down' });

    const { result } = renderHook(() => useEditProfile('en'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // loadedOk must be false, and Save must refuse to write.
    expect(result.current.loadedOk).toBe(false);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('DOES call updateUser when the profile loaded successfully', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: true, data: REAL_PROFILE });

    const { result } = renderHook(() => useEditProfile('en'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadedOk).toBe(true);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    // and it writes the REAL loaded name, never a blank
    expect(mockUpdateUser.mock.calls[0][2]).toMatchObject({ name: 'Real Name' });
  });

  it('also guards when the profile row is genuinely missing (user_not_found)', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: false, error: 'user_not_found' });

    const { result } = renderHook(() => useEditProfile('en'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadedOk).toBe(false);
    await act(async () => {
      await result.current.handleSave();
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
