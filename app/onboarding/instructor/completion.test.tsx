import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// INS-01 follow-up: the wizard guarantees only name and location, so a saved
// row can still fail isInstructorProfileComplete (photo, bio, specialties,
// years_experience). handleFinish must tell the truth about that outcome and
// land the instructor on /dashboard/instructor, the surface that mounts
// InstructorProfileIncompleteBanner. Step 1 Next must explain why it did not
// advance instead of sitting disabled with no message.

const { mockFetchUserProfile, mockUpdateUser, mockGetUser, mockPush, mockShowSuccess, mockConsumePendingReturnTo } =
  vi.hoisted(() => ({
    mockFetchUserProfile: vi.fn(),
    mockUpdateUser: vi.fn(),
    mockGetUser: vi.fn(),
    mockPush: vi.fn(),
    mockShowSuccess: vi.fn(),
    mockConsumePendingReturnTo: vi.fn(),
  }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: mockPush }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser }, storage: { from: () => ({}) } }),
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en', t: (k: string) => k }) }));
vi.mock('@/lib/dal', () => ({
  fetchUserProfile: (...a: unknown[]) => mockFetchUserProfile(...a),
  updateUser: (...a: unknown[]) => mockUpdateUser(...a),
}));
vi.mock('@/lib/pendingReturnTo', () => ({ consumePendingReturnTo: () => mockConsumePendingReturnTo() }));
vi.mock('@/lib/toast', () => ({ showSuccess: (...a: unknown[]) => mockShowSuccess(...a), showError: vi.fn() }));
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
vi.mock('@/components/ui/label', () => ({
  Label: (p: { children?: unknown }) => <label>{p.children as never}</label>,
}));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: (p: { children?: unknown }) => <div>{p.children as never}</div>,
  AvatarImage: () => <img alt="" />,
  AvatarFallback: (p: { children?: unknown }) => <div>{p.children as never}</div>,
}));

import InstructorOnboardingPage from './page';

const LOCATION_PLACEHOLDER = 'Laureles, Medellín';
const COMPLETE_COPY = 'Profile complete!';
const INCOMPLETE_COPY = 'Profile saved. A few details are still missing before you appear in the directory.';
const LOCATION_REQUIRED = 'Add your location so you appear in the directory.';
const NAME_REQUIRED = 'Add your full name.';
const STEP_2_TITLE = 'Set up your storefront';

// A row that passes every check in lib/instructorProfile.ts.
const completeRow = {
  id: 'u1',
  name: 'Existing',
  avatar_url: 'https://cdn.example/avatar.jpg',
  photos: [],
  bio: 'I coach.',
  instructor_bio: null,
  specialties: ['Yoga'],
  location: 'Laureles',
  years_experience: 3,
};

// A row that fails on photo, specialties and years even after name+location.
const incompleteRow = {
  id: 'u1',
  name: 'Existing',
  avatar_url: null,
  photos: [],
  bio: '',
  instructor_bio: null,
  specialties: [],
  location: null,
  years_experience: null,
};

async function typeName() {
  const nameInput = (await screen.findAllByRole('textbox'))[0];
  fireEvent.change(nameInput, { target: { value: 'Typed Name' } });
}

async function typeLocation() {
  const locationInput = await screen.findByPlaceholderText(LOCATION_PLACEHOLDER);
  fireEvent.change(locationInput, { target: { value: 'Laureles' } });
}

async function clickSkipAndFinish() {
  const skip = await screen.findByText(/skip and finish later/i);
  fireEvent.click(skip);
}

describe('instructor onboarding: honest completion toast and destination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: {} } } });
    mockUpdateUser.mockResolvedValue({ success: true, data: null });
    mockConsumePendingReturnTo.mockReturnValue(null);
  });

  it('shows the incomplete copy and routes to /dashboard/instructor when the saved profile fails the gate', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: true, data: incompleteRow });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await typeName();
    await typeLocation();
    await clickSkipAndFinish();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith(INCOMPLETE_COPY));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/instructor');
  });

  it('shows the complete copy when the saved profile passes the gate', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: true, data: completeRow });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await clickSkipAndFinish();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith(COMPLETE_COPY));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/instructor');
  });

  it('does not advance from step 1 with a blank location and reveals the required message', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: true, data: incompleteRow });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await typeName();
    expect(screen.queryByText(LOCATION_REQUIRED)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));

    expect(await screen.findByText(LOCATION_REQUIRED)).toBeTruthy();
    expect(screen.queryByText(STEP_2_TITLE)).toBeNull();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('reveals the name required message when Next is clicked with a blank name', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: true, data: { ...incompleteRow, name: '' } });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await typeLocation();
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));

    expect(await screen.findByText(NAME_REQUIRED)).toBeTruthy();
    expect(screen.queryByText(STEP_2_TITLE)).toBeNull();
  });

  it('honors an explicit pendingReturnTo over the /dashboard/instructor fallback', async () => {
    mockFetchUserProfile.mockResolvedValue({ success: true, data: completeRow });
    mockConsumePendingReturnTo.mockReturnValue('/session/abc/');
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await clickSkipAndFinish();

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/session/abc/'));
    expect(mockPush).not.toHaveBeenCalledWith('/dashboard/instructor');
  });
});
