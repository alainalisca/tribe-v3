import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// BUG-010 (second proven wipe): instructor onboarding's handleFinish must NOT
// write when the profile never successfully loaded, or a transient load failure
// overwrites an existing instructor's bio/specialties/photos with the empty form.

const { mockFetchUserProfile, mockUpdateUser, mockGetUser } = vi.hoisted(() => ({
  mockFetchUserProfile: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser }, storage: { from: () => ({}) } }),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en', t: (k: string) => k }) }));
vi.mock('@/lib/dal', () => ({
  fetchUserProfile: (...a: unknown[]) => mockFetchUserProfile(...a),
  updateUser: (...a: unknown[]) => mockUpdateUser(...a),
}));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/errorMessages', () => ({ getErrorMessage: () => 'err' }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={String(p.alt ?? '')} /> }));
vi.mock('@/components/LoadingSpinner', () => ({ default: () => <div>loading</div> }));
vi.mock('@/components/stories/storyUploadHelpers', () => ({ compressImage: vi.fn() }));
vi.mock('@/components/ui/input', () => ({
  Input: (p: Record<string, unknown>) => <input {...(p as object)} />,
}));
vi.mock('@/components/ui/label', () => ({ Label: (p: { children?: unknown }) => <label>{p.children as never}</label> }));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: (p: { children?: unknown }) => <div>{p.children as never}</div>,
  AvatarImage: () => <img alt="" />,
  AvatarFallback: (p: { children?: unknown }) => <div>{p.children as never}</div>,
}));

import InstructorOnboardingPage from './page';

async function fillNameAndClickSkip() {
  // Typing a name reveals the "Skip and finish later" link (which calls
  // handleFinish) — the shortest path to the save without step navigation.
  const nameInput = (await screen.findAllByRole('textbox'))[0];
  fireEvent.change(nameInput, { target: { value: 'Typed Name' } });
  const skip = await screen.findByText(/skip and finish later/i);
  fireEvent.click(skip);
}

describe('instructor onboarding — BUG-010 save guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: {} } } });
    mockUpdateUser.mockResolvedValue({ success: true, data: null });
  });

  it('does NOT call updateUser when the profile load FAILED', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: false, error: 'network down' });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await fillNameAndClickSkip();

    // guard blocks the write despite a filled name
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('DOES call updateUser when the profile loaded successfully', async () => {
    mockFetchUserProfile.mockResolvedValue({
      success: true,
      data: { id: 'u1', name: 'Existing', bio: 'b', specialties: [], photos: [] },
    });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await fillNameAndClickSkip();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
  });
});
