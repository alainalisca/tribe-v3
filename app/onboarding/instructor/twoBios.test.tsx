import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Issue 2 from Ronald Gallego's onboarding. users.bio and users.instructor_bio
 * are two real fields and were NOT merged: three of the ten instructors with
 * both filled use them as two genuinely different texts, and one of the three
 * keeps her English in `bio` and her Spanish in `instructor_bio`. Merging would
 * have dropped one of her two languages on a Medellin platform.
 *
 * What was actually wrong was the labelling and the ORDERING. The two textareas
 * sat back to back inside step 1, rows={2} then rows={3}, under labels reading
 * "About you (bio)" and "Professional bio" -- which describe a TONE. Seven of
 * ten instructors hold byte-identical text in both columns, which is the
 * predictable result of that layout rather than instructor error.
 *
 * So: the labels name the DESTINATION, and the storefront bio moves to step 2
 * beside the storefront preview it appears on. These tests assert the
 * separation and each field's destination, because the failure mode is a
 * successful save of the right text into a field the instructor did not mean.
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

const SHORT_BIO_PLACEHOLDER = 'One or two lines about who you are';
const STOREFRONT_BIO_PLACEHOLDER = 'Your experience, your approach, why someone should train with you';

async function mount(profile: Record<string, unknown> = {}) {
  mockFetchUserProfile.mockResolvedValue({
    success: true,
    data: {
      id: 'u1',
      name: 'Existing',
      bio: '',
      instructor_bio: '',
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

async function goToStep2() {
  fireEvent.click(await screen.findByText('Next'));
  await waitFor(() => expect(screen.queryByPlaceholderText(STOREFRONT_BIO_PLACEHOLDER)).not.toBeNull());
}

async function finish() {
  fireEvent.click(await screen.findByText(/skip and finish later/i));
  await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1));
  return mockUpdateUser.mock.calls[0][2] as Record<string, unknown>;
}

describe('the two bio fields are separated and separately labelled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: {} } } });
    mockUpdateUser.mockResolvedValue({ success: true, data: null });
  });

  it('never shows both bio fields on the same step', async () => {
    // The adjacency IS the defect. Two textareas back to back with nothing on
    // screen distinguishing them is why seven of ten pairs are identical.
    await mount();
    expect(screen.queryByPlaceholderText(SHORT_BIO_PLACEHOLDER)).not.toBeNull();
    expect(screen.queryByPlaceholderText(STOREFRONT_BIO_PLACEHOLDER)).toBeNull();

    await goToStep2();
    expect(screen.queryByPlaceholderText(STOREFRONT_BIO_PLACEHOLDER)).not.toBeNull();
    expect(screen.queryByPlaceholderText(SHORT_BIO_PLACEHOLDER)).toBeNull();
  });

  it('labels each field by where it goes, not by its tone', async () => {
    await mount();
    expect(screen.queryByText(/Shown on your profile and in search results/)).not.toBeNull();
    // 'Professional bio' described a register, which is what invited pasting.
    expect(screen.queryByText(/Professional bio/)).toBeNull();
    expect(screen.queryByText(/About you/)).toBeNull();

    await goToStep2();
    expect(screen.queryByText(/where athletes decide to book/)).not.toBeNull();
  });

  it('the short bio lands in bio and the storefront bio in instructor_bio', async () => {
    await mount();
    fireEvent.change(await screen.findByPlaceholderText(SHORT_BIO_PLACEHOLDER), {
      target: { value: 'Two lines about me' },
    });
    await goToStep2();
    fireEvent.change(await screen.findByPlaceholderText(STOREFRONT_BIO_PLACEHOLDER), {
      target: { value: 'The longer pitch' },
    });

    const payload = await finish();
    expect(payload.bio).toBe('Two lines about me');
    expect(payload.instructor_bio).toBe('The longer pitch');
  });

  it('keeps two different texts apart, the Neera case', async () => {
    // bio in English, instructor_bio in Spanish. Re-running the wizard must
    // round-trip both, or it becomes the merge by another route.
    await mount({ bio: 'I am a yoga and sound healing instructor.', instructor_bio: 'Soy instructora de yoga.' });

    const payload = await finish();
    expect(payload.bio).toBe('I am a yoga and sound healing instructor.');
    expect(payload.instructor_bio).toBe('Soy instructora de yoga.');
  });

  it('writes neither column from the other when only one is filled', async () => {
    await mount({ bio: 'Short only', instructor_bio: '' });

    const payload = await finish();
    expect(payload.bio).toBe('Short only');
    expect(payload.instructor_bio).toBeNull();
  });

  it('the storefront preview shows the storefront bio as it is typed', async () => {
    await mount();
    await goToStep2();
    fireEvent.change(await screen.findByPlaceholderText(STOREFRONT_BIO_PLACEHOLDER), {
      target: { value: 'Fourteen years of BJJ' },
    });

    // Once in the field, once in the preview beside it.
    await waitFor(() => expect(screen.queryAllByText('Fourteen years of BJJ').length).toBeGreaterThan(0));
    const preview = screen.getAllByText('Fourteen years of BJJ').filter((el) => el.tagName === 'P');
    expect(preview.length, 'the storefront bio should be rendered in the preview').toBe(1);
  });

  it('the preview does not show the short bio, which is not on the storefront', async () => {
    await mount({ bio: 'NOT-ON-THE-STOREFRONT' });
    await goToStep2();
    expect(screen.queryByText('NOT-ON-THE-STOREFRONT')).toBeNull();
  });
});
