import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// INS-01: the completeness gate (lib/instructorProfile.ts) requires a non-empty
// users.location, but the wizard never wrote it, so every instructor who
// finished onboarding stayed "incomplete" and hidden from /instructors.
// handleFinish must write location when the field has a value and must omit
// the key entirely when blank, so a value saved from /profile/edit is never
// cleared by re-running the wizard.

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

async function typeName() {
  const nameInput = (await screen.findAllByRole('textbox'))[0];
  fireEvent.change(nameInput, { target: { value: 'Typed Name' } });
}

async function clickSkipAndFinish() {
  // "Skip and finish later" calls handleFinish directly; the shortest path to
  // the save without walking the three steps.
  const skip = await screen.findByText(/skip and finish later/i);
  fireEvent.click(skip);
}

function payloadOfOnlyUpdateCall(): Record<string, unknown> {
  expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  return mockUpdateUser.mock.calls[0][2] as Record<string, unknown>;
}

describe('instructor onboarding INS-01: location is written only when present', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: {} } } });
    mockUpdateUser.mockResolvedValue({ success: true, data: null });
  });

  it('includes location in the updateUser payload when the field has a value', async () => {
    mockFetchUserProfile.mockResolvedValue({
      success: true,
      data: { id: 'u1', name: 'Existing', bio: 'b', specialties: [], photos: [], location: null },
    });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await typeName();
    const locationInput = await screen.findByPlaceholderText(LOCATION_PLACEHOLDER);
    fireEvent.change(locationInput, { target: { value: '  Laureles  ' } });
    await clickSkipAndFinish();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    expect(payloadOfOnlyUpdateCall().location).toBe('Laureles');
  });

  it('omits the location key entirely when the field is blank', async () => {
    mockFetchUserProfile.mockResolvedValue({
      success: true,
      data: { id: 'u1', name: 'Existing', bio: 'b', specialties: [], photos: [], location: null },
    });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    await typeName();
    await clickSkipAndFinish();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    expect(payloadOfOnlyUpdateCall()).not.toHaveProperty('location');
  });

  it('prefills the field from the existing users.location so a rerun cannot blank it', async () => {
    mockFetchUserProfile.mockResolvedValue({
      success: true,
      data: { id: 'u1', name: 'Existing', bio: 'b', specialties: [], photos: [], location: 'El Poblado' },
    });
    render(<InstructorOnboardingPage />);
    await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());

    const locationInput = (await screen.findByPlaceholderText(LOCATION_PLACEHOLDER)) as HTMLInputElement;
    expect(locationInput.value).toBe('El Poblado');

    await clickSkipAndFinish();

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
    expect(payloadOfOnlyUpdateCall().location).toBe('El Poblado');
  });
});
