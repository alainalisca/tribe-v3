import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Issue 1: instructor onboarding never wrote users.sports. Its chips wrote
 * into users.specialties, which is free text, and discovery filtered its sport
 * chips against that free text -- so a chip matched only when an instructor
 * happened to spell the sport exactly the way the chip did.
 *
 * The screen now has two fields with two destinations:
 *   Sports       canonical chips  -> users.sports       (what discovery filters)
 *   Specialties  free text        -> users.specialties  (shown and searched)
 *
 * These tests assert the DESTINATION of each control, not just that the save
 * succeeded. The original bug was a successful save into the wrong column,
 * which is invisible from the wizard: the toast said saved, the row was
 * written, and the instructor was unreachable by every sport chip.
 */

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
import { SPORTS_LIST } from '@/lib/sports';

const SPECIALTY_PLACEHOLDER = 'Sound healing, prenatal, competition prep...';

async function mount(profile: Record<string, unknown> = {}) {
  mockFetchUserProfile.mockResolvedValue({
    success: true,
    data: {
      id: 'u1',
      name: 'Existing',
      bio: 'b',
      sports: [],
      specialties: [],
      photos: [],
      location: 'Medellín',
      ...profile,
    },
  });
  render(<InstructorOnboardingPage />);
  await waitFor(() => expect(mockFetchUserProfile).toHaveBeenCalled());
}

async function finish() {
  fireEvent.click(await screen.findByText(/skip and finish later/i));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
  return mockUpdateUser.mock.calls[0][2] as Record<string, unknown>;
}

describe('instructor onboarding writes sports and specialties to different columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: {} } } });
    mockUpdateUser.mockResolvedValue({ success: true, data: null });
  });

  it('a chip lands in sports, and leaves specialties empty', async () => {
    await mount();
    fireEvent.click(await screen.findByText('Boxing'));

    const payload = await finish();
    expect(payload.sports).toEqual(['Boxing']);
    expect(payload.specialties).toEqual([]);
  });

  it('free text lands in specialties, and leaves sports empty', async () => {
    await mount();
    const input = await screen.findByPlaceholderText(SPECIALTY_PLACEHOLDER);
    fireEvent.change(input, { target: { value: 'Sound healing, prenatal' } });
    fireEvent.blur(input);

    const payload = await finish();
    expect(payload.specialties).toEqual(['Sound healing', 'prenatal']);
    expect(payload.sports).toEqual([]);
  });

  it('keeps both, in their own columns, when the instructor fills in both', async () => {
    await mount();
    fireEvent.click(await screen.findByText('Yoga'));
    const input = await screen.findByPlaceholderText(SPECIALTY_PLACEHOLDER);
    fireEvent.change(input, { target: { value: "women's circles" } });
    fireEvent.blur(input);

    const payload = await finish();
    expect(payload.sports).toEqual(['Yoga']);
    expect(payload.specialties).toEqual(["women's circles"]);
  });

  it('offers every canonical sport except Other, and nothing else', async () => {
    // The old local list held six values that existed nowhere else in the app
    // (Functional Training, HIIT, Strength Training, Martial Arts, Stretching,
    // Meditation). Any of them appearing as a chip again is the defect
    // returning, so this asserts the chip set EXACTLY rather than a subset.
    await mount();
    await screen.findByText('Yoga');

    for (const sport of SPORTS_LIST) {
      if (sport === 'Other') continue;
      expect(screen.queryByText(sport), `${sport} should be offered as a chip`).not.toBeNull();
    }
    expect(screen.queryByText('Other')).toBeNull();
    for (const gone of [
      'Functional Training',
      'HIIT',
      'Strength Training',
      'Martial Arts',
      'Stretching',
      'Meditation',
    ]) {
      expect(screen.queryByText(gone), `${gone} is not a canonical sport and must not be a chip`).toBeNull();
    }
  });

  it('prefills the chips from the existing users.sports so a rerun cannot blank them', async () => {
    await mount({ sports: ['Kickboxing'], specialties: ['Artes marciales'] });

    const payload = await finish();
    expect(payload.sports).toEqual(['Kickboxing']);
    expect(payload.specialties).toEqual(['Artes marciales']);
  });

  it('a specialty spelled like a sport stays a removable tag, not a silent duplicate', async () => {
    // Before the split, the tag list was filtered by !SPORTS_LIST.includes(s),
    // so a free-text "Boxing" was invisible in the UI while still being saved.
    await mount({ specialties: ['Boxing'] });
    await screen.findByPlaceholderText(SPECIALTY_PLACEHOLDER);

    const payload = await finish();
    expect(payload.specialties).toEqual(['Boxing']);
    expect(payload.sports).toEqual([]);
  });
});
