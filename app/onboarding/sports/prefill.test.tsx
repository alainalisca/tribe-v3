/**
 * THE SAVE IS AN OVERWRITE. THE SCREEN MUST NOT RUN IT FROM AN UNKNOWN BASELINE.
 *
 * complete_athlete_setup does `SET sports = v_clean`. A screen that starts
 * empty and saves what is on it REPLACES the list rather than editing it.
 *
 * Found on a real device, not in review: an account with all 23 sports opened
 * this screen and it showed none selected. Tapping one and saving would have
 * written a list of one and silently dropped 22, with a success toast.
 *
 * CLAUDE.md already records this shape for the storefront editor -- "a PATCH
 * whose payload is built from component state will blank any column that state
 * does not know about" -- and a call-site guard was added for that component.
 * Then it was reproduced here. So these cases assert the property, not the
 * component: what is loaded, and what can be written before it loads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();
const getUser = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/onboarding/AvatarUploadField', () => ({ default: () => <div /> }));
vi.mock('@/lib/dal/athleteSetup', () => ({ completeAthleteSetup: vi.fn(), fetchOwnSports: vi.fn() }));

import AthleteSportsStep from './page';
import { completeAthleteSetup, fetchOwnSports } from '@/lib/dal/athleteSetup';

/** The 22 chips this screen offers: SPORTS_LIST minus 'Other'. */
const ALL_CHIPS = [
  'CrossFit',
  'Jiu-Jitsu',
  'Running',
  'Hiking',
  'Cycling',
  'Swimming',
  'Weightlifting',
  'Calisthenics',
  'Yoga',
  'Volleyball',
  'Basketball',
  'Soccer',
  'BMX',
  'Skateboarding',
  'Padel',
  'Kickboxing',
  'Muay Thai',
  'Tennis',
  'Dance',
  'Boxing',
  'Pilates',
  'HYROX',
];
const cont = () => screen.getByRole('button', { name: /continue/i });

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  vi.mocked(fetchOwnSports).mockResolvedValue({ success: true, data: [] });
  vi.mocked(completeAthleteSetup).mockResolvedValue({ success: true, data: null });
});

describe('the screen prefills, and cannot shrink a list it never read', () => {
  it('NON-VACUITY: it reads the existing sports on mount', async () => {
    render(<AthleteSportsStep />);
    await waitFor(() => expect(fetchOwnSports).toHaveBeenCalledWith(expect.anything(), 'u1'));
  });

  /** THE BUG, on the exact account that found it. */
  it('an athlete with 22 sports sees them selected, and saving keeps all 22', async () => {
    vi.mocked(fetchOwnSports).mockResolvedValue({ success: true, data: ALL_CHIPS });
    render(<AthleteSportsStep />);
    await waitFor(() => expect(cont()).not.toBeDisabled());

    fireEvent.click(cont());
    await waitFor(() => expect(completeAthleteSetup).toHaveBeenCalled());
    const saved = vi.mocked(completeAthleteSetup).mock.calls[0][1];
    expect(saved).toEqual(ALL_CHIPS);
    expect(saved).toHaveLength(22);
  });

  /**
   * 'Other' is a real value in SPORTS_LIST and this screen offers no chip for
   * it. Al's account has it. A prefill that dropped unrepresented values would
   * silently delete it on the next save -- the same data loss in miniature, and
   * harder to see because there is no control to notice missing.
   */
  it('a stored sport with no chip is preserved, not dropped', async () => {
    vi.mocked(fetchOwnSports).mockResolvedValue({ success: true, data: ['Running', 'Other'] });
    render(<AthleteSportsStep />);
    await waitFor(() => expect(cont()).not.toBeDisabled());
    fireEvent.click(cont());
    await waitFor(() => expect(completeAthleteSetup).toHaveBeenCalled());
    expect(vi.mocked(completeAthleteSetup).mock.calls[0][1]).toContain('Other');
  });

  it('adding one to an existing list saves the union, not the one', async () => {
    vi.mocked(fetchOwnSports).mockResolvedValue({ success: true, data: ['Running', 'Yoga'] });
    render(<AthleteSportsStep />);
    await waitFor(() => expect(cont()).not.toBeDisabled());

    fireEvent.click(await screen.findByText('Boxing'));
    fireEvent.click(cont());
    await waitFor(() => expect(completeAthleteSetup).toHaveBeenCalled());
    expect(vi.mocked(completeAthleteSetup).mock.calls[0][1]).toEqual(['Running', 'Yoga', 'Boxing']);
  });

  /** A DELIBERATE removal must still work. "Cannot shrink UNINTENTIONALLY" is
   *  not "cannot shrink" -- this is an edit screen, and a guard that blocked
   *  every removal would be a different bug. */
  it('a deliberate deselection still removes that sport', async () => {
    vi.mocked(fetchOwnSports).mockResolvedValue({ success: true, data: ['Running', 'Yoga'] });
    render(<AthleteSportsStep />);
    await waitFor(() => expect(cont()).not.toBeDisabled());

    fireEvent.click(await screen.findByText('Yoga')); // toggle OFF a prefilled chip
    fireEvent.click(cont());
    await waitFor(() => expect(completeAthleteSetup).toHaveBeenCalled());
    expect(vi.mocked(completeAthleteSetup).mock.calls[0][1]).toEqual(['Running']);
  });

  it('nothing can be saved BEFORE the existing list has loaded', async () => {
    let release: (v: { success: true; data: string[] }) => void = () => {};
    vi.mocked(fetchOwnSports).mockReturnValue(
      new Promise((r) => {
        release = r as never;
      }) as never
    );
    render(<AthleteSportsStep />);
    fireEvent.click(await screen.findByText('Boxing'));
    // Still loading: the button is disabled AND the handler refuses.
    expect(cont()).toBeDisabled();
    fireEvent.click(cont());
    expect(completeAthleteSetup).not.toHaveBeenCalled();

    release({ success: true, data: ['Running'] });
    await waitFor(() => expect(cont()).not.toBeDisabled());
  });

  /** A FAILED read is not an empty profile, and the difference is 22 sports. */
  it('a FAILED read refuses to save at all', async () => {
    vi.mocked(fetchOwnSports).mockResolvedValue({ success: false, error: 'db down' });
    render(<AthleteSportsStep />);
    fireEvent.click(await screen.findByText('Boxing'));
    await waitFor(() => expect(cont()).toBeDisabled());
    fireEvent.click(cont());
    expect(completeAthleteSetup).not.toHaveBeenCalled();
  });

  it('a signed-out visitor cannot save either', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    render(<AthleteSportsStep />);
    fireEvent.click(await screen.findByText('Boxing'));
    await waitFor(() => expect(cont()).toBeDisabled());
    expect(completeAthleteSetup).not.toHaveBeenCalled();
  });

  it('a genuinely empty profile still works -- [] is an answer, not a failure', async () => {
    vi.mocked(fetchOwnSports).mockResolvedValue({ success: true, data: [] });
    render(<AthleteSportsStep />);
    await waitFor(() => expect(fetchOwnSports).toHaveBeenCalled());
    fireEvent.click(await screen.findByText('Boxing'));
    await waitFor(() => expect(cont()).not.toBeDisabled());
    fireEvent.click(cont());
    await waitFor(() => expect(completeAthleteSetup).toHaveBeenCalledWith(expect.anything(), ['Boxing']));
  });
});
